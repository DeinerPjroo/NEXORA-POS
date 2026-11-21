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
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class CustomerBookTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('book@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->branch = $this->scope(fn () => Branch::firstOrFail()->id);
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Libreta', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function scope(callable $fn): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $fn);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function address(): array
    {
        return ['label' => 'Casa', 'recipient_name' => 'Laura Gómez', 'phone' => '+57 300 1234567', 'address' => 'Calle 10 número 20', 'neighborhood' => 'Centro', 'location_reference' => 'Portería azul', 'instructions' => 'Llamar al llegar'];
    }

    private function payload(): array
    {
        return [...$this->key(), 'branch_id' => $this->branch, 'name' => 'Laura Gómez', 'phone' => '+57 300 1234567', 'initial_address' => $this->address()];
    }

    public function test_customer_and_multiple_addresses_use_revisions_replay_and_no_silent_overwrites(): void
    {
        $body = $this->payload();
        $c = $this->postJson('/api/v1/customers', $body)->assertCreated()->json('data');
        $this->postJson('/api/v1/customers', $body)->assertCreated()->assertJsonPath('data.id', $c['id']);
        $this->assertDatabaseCount('customers', 1);
        $this->assertDatabaseCount('customer_addresses', 1);
        $path = '/api/v1/customers/'.$c['id'];
        $this->getJson('/api/v1/customers?branch_id='.$this->branch.'&search=300123')->assertOk()->assertJsonCount(1, 'data');
        $addressBody = [...$this->key(), ...$this->address(), 'label' => 'Trabajo', 'address' => 'Carrera 30 número 40', 'revision' => 1];
        $next = $this->postJson($path.'/addresses', $addressBody)->assertCreated()->assertJsonPath('data.revision', 2)->json('data');
        $this->assertCount(2, $next['addresses']);
        $this->postJson($path.'/addresses', [...$this->key(), ...$this->address(), 'label' => 'Sede adicional', 'revision' => 2])->assertCreated();
        $this->postJson($path.'/addresses', $addressBody)->assertCreated()->assertJsonPath('data.saved_address_id', $next['saved_address_id'])->assertJsonPath('data.revision', 3)->assertJsonCount(3, 'data.addresses');
        $this->postJson('/api/v1/customers', $body)->assertCreated()->assertJsonPath('data.saved_address_id', $c['addresses'][0]['id']);
        $this->putJson($path, [...$this->key(), 'revision' => 1, 'name' => 'Nombre viejo', 'phone' => '3001111111'])->assertConflict();
        $this->putJson($path.'/addresses/'.$c['addresses'][0]['id'], [...$this->key(), ...$this->address(), 'revision' => 3, 'address_revision' => 9])->assertConflict();
        $this->assertDatabaseHas('customers', ['id' => $c['id'], 'name' => 'Laura Gómez', 'revision' => 3]);
    }

    public function test_delivery_snapshots_are_authoritative_and_do_not_follow_later_address_changes(): void
    {
        $c = $this->postJson('/api/v1/customers', $this->payload())->assertCreated()->json('data');
        $item = $this->scope(function () {
            $cat = Category::create(['name' => 'Carta', 'color' => '#7258df']);
            $p = Product::create(['name' => 'Pizza', 'sku' => 'BOOK-PIZZA', 'category_id' => $cat->id, 'sale_price' => '18000', 'is_active' => true, 'is_available' => true]);

            return ['product_id' => $p->id, 'product_revision' => 1, 'quantity' => 1, 'expected_unit_price' => '18000'];
        });
        $body = [...$this->key(), 'branch_id' => $this->branch, 'currency' => 'COP', 'channel' => 'delivery', 'items' => [$item], 'delivery' => ['recipient_name' => 'Falso', 'phone' => '0000000', 'address' => 'Dirección falsa', 'customer_id' => $c['id'], 'customer_revision' => 1, 'customer_address_id' => $c['addresses'][0]['id'], 'address_revision' => 1]];
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->json('data');
        $path = '/api/v1/customers/'.$c['id'];
        $this->putJson($path.'/addresses/'.$c['addresses'][0]['id'], [...$this->key(), ...$this->address(), 'revision' => 1, 'address_revision' => 1, 'address' => 'Nueva calle número 50'])->assertOk();
        $this->scope(function () use ($order) {
            $d = OrderDelivery::where('order_id', $order['id'])->firstOrFail();
            $this->assertSame('Calle 10 número 20', $d->address);
            $this->assertSame('Laura Gómez', $d->recipient_name);
            $this->assertSame('Centro', $d->neighborhood);
            $this->assertSame('Calle 10 número 20', $d->customer_snapshot['contact']['address']);
        });
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.id', $order['id']);
        $this->postJson('/api/v1/orders', [...$body, ...$this->key()])->assertConflict();
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_deliveries', 1);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_customer_book_is_private_to_permissions_company_and_authorized_branches(): void
    {
        $c = $this->postJson('/api/v1/customers', $this->payload())->assertCreated()->json('data');
        $other = $this->company('other-book@example.test');
        $this->actingAs($other)->getJson('/api/v1/customers/'.$c['id'])->assertNotFound();
        $this->putJson('/api/v1/customers/'.$c['id'], [...$this->key(), 'revision' => 1, 'name' => 'Ajeno', 'phone' => '3001111111'])->assertNotFound();
        $cook = $this->scope(fn () => User::factory()->create(['role_id' => Role::where('name', 'Cocinero')->firstOrFail()->id]));
        $this->actingAs($cook)->getJson('/api/v1/customers?branch_id='.$this->branch)->assertForbidden();
        $this->postJson('/api/v1/customers', $this->payload())->assertForbidden();
        [$staff, $branch] = $this->scope(function () {
            $b = Branch::create(['name' => 'Otra', 'code' => 'OTHER', 'is_active' => true]);
            $u = User::factory()->create(['role_id' => Role::where('name', 'Cajero')->firstOrFail()->id, 'all_branches' => false]);
            $u->branches()->attach($b->id, ['tenant_id' => $u->tenant_id]);

            return [$u, $b->id];
        });
        $this->actingAs($staff)->getJson('/api/v1/customers?branch_id='.$this->branch)->assertNotFound();
        $this->getJson('/api/v1/customers/'.$c['id'])->assertNotFound();
        $this->postJson('/api/v1/customers/'.$c['id'].'/addresses', [...$this->key(), ...$this->address(), 'revision' => 1])->assertNotFound();
        $this->getJson('/api/v1/customers?branch_id='.$branch)->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/customers', [...$this->payload(), 'branch_id' => $branch])->assertCreated();
    }

    public function test_failed_audit_rolls_back_customer_address_and_idempotency_together(): void
    {
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'customer.saved') {
                throw new \RuntimeException('Audit unavailable for test');
            }
        });
        $this->postJson('/api/v1/customers', $this->payload())->assertStatus(500);
        $this->assertDatabaseCount('customers', 0);
        $this->assertDatabaseCount('customer_addresses', 0);
        $this->assertDatabaseCount('idempotency_records', 0);
    }
}
