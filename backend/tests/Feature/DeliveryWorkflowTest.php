<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\OrderDelivery;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class DeliveryWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private array $product;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('delivery@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->branch = $this->scope(fn () => Branch::firstOrFail()->id);
        $this->product = $this->scope(function () {
            $c = Category::create(['name' => 'Carta', 'color' => '#7258df']);
            $p = Product::create(['name' => 'Pizza domicilio', 'sku' => 'DELIVERY', 'category_id' => $c->id, 'sale_price' => '10000', 'is_active' => true, 'is_available' => true]);

            return ['product_id' => $p->id, 'product_revision' => 1, 'quantity' => 2, 'expected_unit_price' => '10000', 'preparation_destination' => 'takeaway'];
        });
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Entregas', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Operador', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function scope(callable $fn): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $fn);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function payload(): array
    {
        return [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'delivery', 'currency' => 'COP', 'items' => [$this->product], 'delivery' => ['recipient_name' => 'Cliente', 'phone' => '3001234567', 'address' => 'Calle de prueba 123', 'instructions' => 'Timbre']];
    }

    private function courier(): User
    {
        return $this->scope(function () {
            $u = User::factory()->create(['role_id' => Role::where('name', 'Repartidor')->firstOrFail()->id, 'all_branches' => false]);
            $u->branches()->attach($this->branch, ['tenant_id' => $u->tenant_id]);

            return $u->refresh();
        });
    }

    private function additions(array $order): array
    {
        return [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'delivery', 'currency' => 'COP', 'append_order_id' => $order['id'], 'order_revision' => $order['revision'], 'delivery_revision' => $order['delivery_revision'], 'items' => [$this->product]];
    }

    public function test_delivery_additions_preserve_history_replay_exactly_and_reject_stale_revisions(): void
    {
        $order = $this->postJson('/api/v1/orders', $this->payload())->assertCreated()->json('data');
        $body = $this->additions($order);
        $next = $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.subtotal', '40000.0000')->assertJsonPath('data.delivery_revision', 2)->assertJsonCount(2, 'data.items')->json('data');
        $this->assertSame($order['items'][0], $next['items'][0]);
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonCount(2, 'data.items');
        $this->postJson('/api/v1/orders', [...$body, 'items' => [[...$this->product, 'quantity' => 3]]])->assertConflict();
        $this->postJson('/api/v1/orders', [...$this->additions($next), 'order_revision' => 1])->assertConflict();
        $this->postJson('/api/v1/orders', [...$this->additions($next), 'delivery_revision' => 1])->assertConflict();
        $this->postJson('/api/v1/orders', [...$this->additions($next), 'delivery' => $this->payload()['delivery']])->assertUnprocessable();
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.delivery_revision', 2)->assertJsonPath('data.revision', 2);
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_items', 2);
        $this->assertDatabaseCount('order_deliveries', 1);
        $this->assertDatabaseCount('delivery_events', 2);
        $this->assertDatabaseHas('order_deliveries', ['order_id' => $order['id'], 'recipient_name' => 'Cliente', 'address' => 'Calle de prueba 123']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'order.items_added']);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_delivery_additions_reject_logistics_changes_foreign_context_and_unauthorized_replays(): void
    {
        $order = $this->postJson('/api/v1/orders', $this->payload())->assertCreated()->json('data');
        $body = $this->additions($order);
        $otherBranch = $this->scope(fn () => Branch::create(['name' => 'Otra sede', 'code' => 'OTHER', 'is_active' => true])->id);
        $this->postJson('/api/v1/orders', [...$body, 'branch_id' => $otherBranch])->assertConflict();
        $this->postJson('/api/v1/orders', [...$body, 'channel' => 'takeaway'])->assertConflict();
        $this->scope(fn () => OrderDelivery::where('order_id', $order['id'])->update(['status' => 'out_for_delivery', 'revision' => 2]));
        $this->postJson('/api/v1/orders', [...$body, 'delivery_revision' => 2])->assertConflict();
        $this->scope(fn () => OrderDelivery::where('order_id', $order['id'])->update(['status' => 'pending', 'revision' => 3]));
        $this->postJson('/api/v1/orders', [...$body, 'delivery_revision' => 2])->assertConflict();
        $body['delivery_revision'] = 3;
        $this->postJson('/api/v1/orders', $body)->assertCreated();
        $this->actingAs($this->courier())->postJson('/api/v1/orders', $body)->assertForbidden();
        $other = $this->company('another-delivery@example.test');
        $this->actingAs($other)->postJson('/api/v1/orders', $body)->assertUnprocessable();
        $this->assertDatabaseCount('order_items', 2);
    }

    public function test_failed_addition_audit_rolls_back_order_delivery_lines_and_idempotency(): void
    {
        $order = $this->postJson('/api/v1/orders', $this->payload())->assertCreated()->json('data');
        $body = $this->additions($order);
        $fail = true;
        AuditLog::creating(function ($log) use (&$fail) {
            if ($fail && $log->action === 'order.items_added') {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $this->postJson('/api/v1/orders', $body)->assertServerError();
        $fail = false;
        $this->assertDatabaseCount('order_items', 1);
        $this->assertDatabaseCount('delivery_events', 1);
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.revision', 1)->assertJsonPath('data.delivery_revision', 1)->assertJsonPath('data.subtotal', '20000.0000');
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonCount(2, 'data.items');
    }

    public function test_delivery_is_distinct_from_pickup_has_authorized_courier_and_never_collects_money(): void
    {
        $body = $this->payload();
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.channel', 'delivery')->json('data');
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.id', $order['id']);
        $this->getJson('/api/v1/orders?channel=takeaway')->assertOk()->assertJsonCount(0, 'data');
        $d = $this->getJson('/api/v1/deliveries?branch_id='.$this->branch)->assertOk()->assertJsonCount(1, 'data')->json('data.0');
        $courier = $this->courier();
        $other = $this->courier();
        $url = '/api/v1/deliveries/'.$d['id'].'/status';
        $d = $this->postJson($url, [...$this->key(), 'revision' => 1, 'status' => 'assigned', 'courier_id' => $courier->id])->assertOk()->json('data');
        $this->actingAs($other)->getJson('/api/v1/deliveries?branch_id='.$this->branch)->assertOk()->assertJsonCount(0, 'data');
        $this->postJson($url, [...$this->key(), 'revision' => 2, 'status' => 'out_for_delivery'])->assertForbidden();
        $this->actingAs($courier)->getJson('/api/v1/deliveries?branch_id='.$this->branch)->assertOk()->assertJsonPath('data.0.address', 'Calle de prueba 123');
        $this->postJson($url, [...$this->key(), 'revision' => 2, 'status' => 'out_for_delivery'])->assertConflict();
        $this->actingAs($this->owner)->postJson('/api/v1/orders/'.$order['id'].'/status', [...$this->key(), 'revision' => $order['revision'], 'status' => 'preparing'])->assertOk();
        $this->postJson('/api/v1/orders/'.$order['id'].'/status', [...$this->key(), 'revision' => $order['revision'] + 1, 'status' => 'ready'])->assertOk();
        $this->actingAs($courier);
        $out = [...$this->key(), 'revision' => 2, 'status' => 'out_for_delivery'];
        $this->postJson($url, $out)->assertOk()->assertJsonPath('data.status', 'out_for_delivery');
        $this->postJson($url, $out)->assertOk()->assertJsonCount(3, 'data.events');
        $this->postJson($url, [...$this->key(), 'revision' => 3, 'status' => 'delivered'])->assertOk()->assertJsonPath('data.status', 'delivered')->assertJsonCount(4, 'data.events');
        $this->actingAs($this->owner)->postJson('/api/v1/orders/'.$order['id'].'/status', [...$this->key(), 'revision' => $order['revision'] + 2, 'status' => 'cancelled', 'reason' => 'Intento posterior'])->assertConflict();
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_deliveries', 1);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_validation_tenant_authorization_and_audit_failure_protect_delivery_data(): void
    {
        $body = $this->payload();
        $this->postJson('/api/v1/orders', [...$body, 'delivery' => null])->assertUnprocessable();
        $this->postJson('/api/v1/orders', [...$body, 'channel' => 'takeaway'])->assertUnprocessable();
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->json('data');
        $d = $this->scope(fn () => OrderDelivery::firstOrFail());
        $courier = $this->courier();
        $url = '/api/v1/deliveries/'.$d->id.'/status';
        $data = [...$this->key(), 'revision' => 1, 'status' => 'assigned', 'courier_id' => $courier->id];
        $foreign = $this->company('foreign-delivery@example.test');
        $this->actingAs($foreign)->postJson($url, $data)->assertNotFound();
        $this->getJson('/api/v1/deliveries?branch_id='.$this->branch)->assertNotFound();
        $readonly = $this->scope(fn () => User::factory()->create());
        $this->actingAs($readonly)->getJson('/api/v1/deliveries?branch_id='.$this->branch)->assertForbidden();
        $this->postJson($url, $data)->assertForbidden();
        $this->actingAs($this->owner);
        AuditLog::creating(function ($log) {
            if ($log->action === 'delivery.status') {
                throw new \RuntimeException('audit unavailable');
            }
        });
        $this->postJson($url, $data)->assertStatus(500);
        $this->assertDatabaseHas('order_deliveries', ['id' => $d->id, 'status' => 'pending', 'revision' => 1, 'courier_id' => null]);
        $this->assertDatabaseCount('delivery_events', 1);
    }

    public function test_cashier_cannot_read_or_mutate_deliveries_of_an_unauthorized_branch(): void
    {
        $branch = $this->postJson('/api/v1/branches', ['name' => 'Otra', 'code' => 'OTRA'])->assertCreated()->json('id');
        $order = $this->postJson('/api/v1/orders', [...$this->payload(), 'branch_id' => $branch])->assertCreated()->json('data');
        $delivery = $this->scope(fn () => OrderDelivery::where('order_id', $order['id'])->firstOrFail());
        $courier = $this->courier();
        $staff = $this->scope(function () {
            $u = User::factory()->create(['role_id' => Role::where('name', 'Cajero')->firstOrFail()->id, 'all_branches' => false]);
            $u->branches()->attach($this->branch, ['tenant_id' => $u->tenant_id]);

            return $u->refresh();
        });
        $this->actingAs($staff)->getJson('/api/v1/deliveries?branch_id='.$branch)->assertNotFound();
        $this->postJson('/api/v1/orders', [...$this->additions($order), 'branch_id' => $this->branch])->assertNotFound();
        $this->postJson('/api/v1/deliveries/'.$delivery->id.'/status', [...$this->key(), 'revision' => 1, 'status' => 'assigned', 'courier_id' => $courier->id])->assertNotFound();
        $this->getJson('/api/v1/deliveries?branch_id='.$this->branch)->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/orders', $this->payload())->assertCreated();
        $this->getJson('/api/v1/deliveries?branch_id='.$this->branch)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.recipient_name', 'Cliente');
        $this->assertDatabaseHas('order_deliveries', ['id' => $delivery->id, 'revision' => 1, 'status' => 'pending', 'courier_id' => null]);
    }
}
