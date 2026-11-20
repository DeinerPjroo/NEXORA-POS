<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderDelivery;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class OrderCustomerTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private array $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('customer@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        [$this->branch, $this->item] = $this->scope(function () {
            $c = Category::create(['name' => 'Carta', 'color' => '#7258df']);
            $p = Product::create(['name' => 'Pizza', 'sku' => 'CUSTOMER', 'category_id' => $c->id, 'sale_price' => '10000', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, ['product_id' => $p->id, 'product_revision' => 1, 'quantity' => 1, 'expected_unit_price' => '10000']];
        });
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Clientes', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function scope(callable $fn): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $fn);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function order(string $channel = 'takeaway'): array
    {
        return $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $this->branch, 'currency' => 'COP', 'channel' => $channel, 'customer_name' => 'Laura', 'reference' => '3001234567', 'notes' => 'Sin cebolla', 'items' => [$this->item], ...($channel === 'delivery' ? ['delivery' => ['recipient_name' => 'Laura', 'phone' => '3001234567', 'address' => 'Calle 10 número 20']] : [])])->assertCreated()->json('data');
    }

    private function body(int $revision = 1): array
    {
        return [...$this->key(), 'revision' => $revision, 'customer_name' => 'Carlos', 'reference' => '3101234567', 'reason' => 'Cambio de persona que recoge'];
    }

    public function test_customer_update_is_atomic_revisioned_and_idempotent_without_changing_order_contents(): void
    {
        $o = $this->order();
        $url = '/api/v1/orders/'.$o['id'].'/customer';
        $body = $this->body();
        $this->getJson($url)->assertOk()->assertJsonPath('data.customer_name', 'Laura');
        $updated = $this->putJson($url, $body)->assertOk()->assertJsonPath('data.customer_name', 'Carlos')->assertJsonPath('data.revision', 2)->json('data');
        $this->assertSame($o['items'], $updated['items']);
        $this->assertSame($o['subtotal'], $updated['subtotal']);
        $this->assertSame($o['notes'], $updated['notes']);
        $this->assertSame($o['status'], $updated['status']);
        $this->putJson($url, $body)->assertOk()->assertJsonPath('data.revision', 2);
        $this->putJson($url, [...$body, 'customer_name' => 'Otra'])->assertConflict();
        $this->putJson($url, $this->body())->assertConflict();
        $this->putJson($url, [...$this->body(2), 'items' => [$this->item]])->assertUnprocessable();
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->scope(fn () => $this->assertSame(1, AuditLog::where('action', 'order.customer.updated')->where('actor_id', $this->owner->id)->count()));
    }

    public function test_delivery_contacts_require_current_revision_and_cannot_change_after_dispatch(): void
    {
        $o = $this->order('delivery');
        $url = '/api/v1/orders/'.$o['id'].'/customer';
        $d = $this->getJson($url)->assertOk()->json('data.delivery');
        $body = [...$this->body(), 'delivery' => [...$d, 'recipient_name' => 'Carlos', 'address' => 'Calle nueva número 30']];
        $this->putJson($url, [...$body, 'delivery' => [...$body['delivery'], 'revision' => 2]])->assertConflict();
        $this->putJson($url, $body)->assertOk()->assertJsonPath('data.revision', 2);
        $this->putJson($url, $body)->assertOk();
        $this->getJson($url)->assertJsonPath('data.delivery.recipient_name', 'Carlos')->assertJsonPath('data.delivery.revision', 2);
        $this->scope(fn () => OrderDelivery::where('order_id', $o['id'])->update(['status' => 'out_for_delivery', 'revision' => 3]));
        $this->putJson($url, [...$this->body(2), 'delivery' => [...$d, 'revision' => 3]])->assertConflict();
        $this->assertDatabaseCount('delivery_events', 2);
    }

    public function test_customer_access_is_scoped_to_permissions_company_and_branch(): void
    {
        $o = $this->order();
        $url = '/api/v1/orders/'.$o['id'].'/customer';
        $other = $this->company('other-customer@example.test');
        $this->actingAs($other)->getJson($url)->assertNotFound();
        $this->putJson($url, $this->body())->assertNotFound();
        $reader = $this->scope(fn () => User::factory()->create(['role_id' => Role::where('name', 'Cocinero')->firstOrFail()->id]));
        $this->actingAs($reader)->getJson($url)->assertForbidden();
        $this->putJson($url, $this->body())->assertForbidden();
        $staff = $this->scope(function () {
            $branch = Branch::create(['name' => 'Otra', 'code' => 'OTHER', 'is_active' => true]);
            $u = User::factory()->create(['role_id' => Role::where('name', 'Mesero')->firstOrFail()->id, 'all_branches' => false]);
            $u->branches()->attach($branch->id, ['tenant_id' => $u->tenant_id]);

            return $u;
        });
        $this->actingAs($staff)->getJson($url)->assertNotFound();
        $this->putJson($url, $this->body())->assertNotFound();
        $this->assertDatabaseHas('orders', ['id' => $o['id'], 'customer_name' => 'Laura', 'revision' => 1]);
    }

    public function test_sold_and_finalized_orders_reject_customer_edits_without_changing_financial_history(): void
    {
        $o = $this->order();
        $url = '/api/v1/orders/'.$o['id'].'/customer';
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Sin impuesto', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $cash = $this->postJson('/api/v1/cash/registers/'.$register.'/open', [...$this->key(), 'opening_amount' => '0', 'currency' => 'COP'])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$o['id'].'/collect', [...$this->key(), 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '10000', 'received_amount' => '10000'])->assertCreated()->json('data');
        $revision = $this->getJson('/api/v1/orders/'.$o['id'])->json('data.revision');
        $this->putJson($url, $this->body($revision))->assertConflict();
        $this->assertDatabaseHas('sales', ['id' => $sale['id'], 'total' => '10000']);
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 1);
        $next = $this->order();
        $this->scope(fn () => Order::whereKey($next['id'])->update(['status' => 'cancelled']));
        $this->putJson('/api/v1/orders/'.$next['id'].'/customer', $this->body())->assertConflict();
    }
}
