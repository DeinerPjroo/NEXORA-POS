<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class OrderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function owner(string $email = 'orders@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function workspace(User $owner, string $price = '123.4567'): array
    {
        $this->actingAs($owner);

        return app(TenantContext::class)->run($owner->tenant_id, function () use ($price) {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Producto original', 'sku' => 'SKU-ORIGINAL', 'category_id' => $category->id, 'sale_price' => $price, 'is_active' => true, 'is_available' => true])->refresh();

            return ['branch' => Branch::first()->id, 'product' => $product];
        });
    }

    private function payload(array $workspace, array $changes = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $workspace['branch'], 'channel' => 'takeaway', 'currency' => 'COP', 'reference' => 'Pedido Ana', 'items' => [['product_id' => $workspace['product']->id, 'quantity' => 3, 'product_revision' => 1, 'expected_unit_price' => $workspace['product']->sale_price]], ...$changes];
    }

    public function test_order_uses_exact_server_prices_and_keeps_snapshots_after_catalog_changes(): void
    {
        $owner = $this->owner();
        $work = $this->workspace($owner);
        $id = $this->postJson('/api/v1/orders', $this->payload($work))->assertCreated()->assertJsonPath('data.subtotal', '370.3701')->json('data.id');
        app(TenantContext::class)->run($owner->tenant_id, fn () => $work['product']->update(['name' => 'Nombre nuevo', 'sale_price' => '999']));
        $this->getJson('/api/v1/orders/'.$id)->assertOk()->assertJsonPath('data.items.0.product_name', 'Producto original')->assertJsonPath('data.items.0.unit_price', '123.4567')->assertJsonPath('data.subtotal', '370.3701');
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_order_retry_is_idempotent_and_key_reuse_with_other_payload_is_rejected(): void
    {
        $work = $this->workspace($this->owner());
        $data = $this->payload($work);
        $id = $this->postJson('/api/v1/orders', $data)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/orders', $data)->assertCreated()->assertJsonPath('data.id', $id);
        $this->postJson('/api/v1/orders', [...$data, 'reference' => 'Otro'])->assertConflict();
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_events', 1);
    }

    public function test_stale_revision_price_unavailability_and_forged_total_are_rejected_atomically(): void
    {
        $work = $this->workspace($this->owner());
        $data = $this->payload($work);
        $this->postJson('/api/v1/orders', [...$data, 'subtotal' => '0'])->assertUnprocessable();
        $bad = $data;
        $bad['items'][0]['expected_unit_price'] = '1';
        $this->postJson('/api/v1/orders', $bad)->assertConflict();
        $bad['items'][0]['expected_unit_price'] = $work['product']->sale_price;
        $bad['items'][0]['product_revision'] = 2;
        $this->postJson('/api/v1/orders', $bad)->assertConflict();
        DB::table('products')->where('id', $work['product']->id)->update(['is_available' => false]);
        $this->postJson('/api/v1/orders', $data)->assertConflict();
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
        $this->assertDatabaseCount('idempotency_records', 0);
    }

    public function test_variant_is_mandatory_and_its_price_is_used(): void
    {
        $work = $this->workspace($this->owner());
        $variant = $this->postJson('/api/v1/products/'.$work['product']->id.'/variants', ['name' => 'Grande', 'sku' => 'SKU-GRANDE', 'sale_price' => '200.0025', 'currency' => 'COP', 'product_revision' => 1, 'is_active' => true, 'is_available' => true])->assertCreated()->json('data.id');
        $data = $this->payload($work);
        $data['items'][0]['product_revision'] = 2;
        $this->postJson('/api/v1/orders', $data)->assertConflict();
        $data['items'][0]['variant_id'] = $variant;
        $data['items'][0]['expected_unit_price'] = '200.0025';
        $this->postJson('/api/v1/orders', $data)->assertCreated()->assertJsonPath('data.subtotal', '600.0075')->assertJsonPath('data.items.0.variant_name', 'Grande');
    }

    public function test_order_state_machine_revision_and_cancellation_reason(): void
    {
        $work = $this->workspace($this->owner());
        $id = $this->postJson('/api/v1/orders', $this->payload($work))->json('data.id');
        $path = '/api/v1/orders/'.$id.'/status';
        $state = ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'status' => 'ready'];
        $this->postJson($path, $state)->assertConflict();
        $this->postJson($path, [...$state, 'status' => 'cancelled'])->assertUnprocessable();
        $prepare = [...$state, 'status' => 'preparing'];
        $this->postJson($path, $prepare)->assertOk()->assertJsonPath('data.revision', 2);
        $this->postJson($path, $prepare)->assertOk()->assertJsonPath('data.revision', 2);
        $this->postJson($path, [...$state, 'idempotency_key' => (string) Str::uuid(), 'status' => 'cancelled', 'reason' => 'Cliente canceló'])->assertConflict();
        $this->postJson($path, [...$state, 'idempotency_key' => (string) Str::uuid(), 'revision' => 2, 'status' => 'cancelled', 'reason' => 'Cliente canceló'])->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonCount(3, 'data.events');
        $this->postJson($path, [...$state, 'idempotency_key' => (string) Str::uuid(), 'revision' => 3, 'status' => 'preparing'])->assertConflict();
        $this->assertDatabaseCount('orders', 1);
    }

    public function test_delivered_order_is_not_a_payment_and_cannot_be_cancelled(): void
    {
        $work = $this->workspace($this->owner());
        $id = $this->postJson('/api/v1/orders', $this->payload($work))->json('data.id');
        $revision = 1;
        foreach (['preparing', 'ready', 'delivered'] as $status) {
            $this->postJson('/api/v1/orders/'.$id.'/status', ['idempotency_key' => (string) Str::uuid(), 'revision' => $revision++, 'status' => $status])->assertOk();
        }
        $this->postJson('/api/v1/orders/'.$id.'/status', ['idempotency_key' => (string) Str::uuid(), 'revision' => 4, 'status' => 'cancelled', 'reason' => 'No permitido'])->assertConflict();
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_other_company_products_branches_and_orders_are_not_accessible(): void
    {
        $a = $this->owner();
        $workA = $this->workspace($a);
        $id = $this->postJson('/api/v1/orders', $this->payload($workA))->json('data.id');
        $b = $this->owner('other@example.test');
        $workB = $this->workspace($b);
        $this->getJson('/api/v1/orders')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/orders/'.$id)->assertNotFound();
        $this->postJson('/api/v1/orders', $this->payload($workA))->assertUnprocessable();
        $data = $this->payload($workB);
        $data['items'][0]['product_id'] = $workA['product']->id;
        $this->postJson('/api/v1/orders', $data)->assertConflict();
    }

    public function test_read_only_or_unprivileged_users_cannot_create_or_transition_orders(): void
    {
        $owner = $this->owner();
        $work = $this->workspace($owner);
        $user = app(TenantContext::class)->run($owner->tenant_id, fn () => User::factory()->create());
        $this->actingAs($user)->getJson('/api/v1/orders')->assertForbidden();
        $this->postJson('/api/v1/orders', $this->payload($work))->assertForbidden();
    }

    public function test_overflow_quantities_and_inactive_branch_leave_no_order(): void
    {
        $work = $this->workspace($this->owner(), '999999999999999.9999');
        $data = $this->payload($work);
        $this->postJson('/api/v1/orders', $data)->assertUnprocessable();
        $data['items'][0]['quantity'] = 1000;
        $this->postJson('/api/v1/orders', $data)->assertUnprocessable();
        $data['items'][0]['quantity'] = 1;
        $data['items'][0]['expected_unit_price'] = '1';
        DB::table('branches')->where('id', $work['branch'])->update(['is_active' => false]);
        $this->postJson('/api/v1/orders', $data)->assertConflict();
        $this->assertDatabaseCount('orders', 0);
    }
}
