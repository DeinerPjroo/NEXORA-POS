<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\CourierCollection;
use App\Models\OrderDelivery;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Str;
use Tests\SqlConcurrencyTestCase;

class CourierCollectionConcurrencyTest extends SqlConcurrencyTestCase
{
    public function test_parallel_collection_and_remittance_do_not_duplicate_sales_payments_or_cash(): void
    {
        $this->requireSql();
        PermissionCatalog::seed();
        $actor = app(RegisterCompany::class)->execute(['company_name' => 'Cobro reparto SQL', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Operador', 'email' => 'collection-sql@example.test', 'password' => 'SeguraNexora123']);
        [$branch, $product, $courier] = app(TenantContext::class)->run($actor->tenant_id, function () {
            $category = Category::create(['name' => 'Carta', 'color' => '#7255db']);
            $product = Product::create(['name' => 'Pizza', 'sku' => 'COURIER-SQL', 'category_id' => $category->id, 'sale_price' => '100.01', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id, User::factory()->create(['role_id' => Role::where('name', 'Repartidor')->firstOrFail()->id, 'all_branches' => true])->id];
        });
        $this->actingAs($actor)->withHeader('Origin', 'http://127.0.0.1:5173');
        $key = fn () => ['idempotency_key' => (string) Str::uuid()];
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Sin impuesto', 'tax_rate' => '0'])->assertOk();
        $order = $this->postJson('/api/v1/orders', [...$key(), 'branch_id' => $branch, 'channel' => 'delivery', 'currency' => 'COP', 'delivery' => ['recipient_name' => 'Ana', 'phone' => '3001234567', 'address' => 'Calle de prueba 123'], 'items' => [['product_id' => $product, 'product_revision' => 1, 'quantity' => 1, 'expected_unit_price' => '100.01']]])->assertCreated()->json('data');
        foreach (['preparing', 'ready'] as $i => $status) {
            $this->postJson('/api/v1/orders/'.$order['id'].'/status', [...$key(), 'revision' => $i + 1, 'status' => $status])->assertOk();
        }
        $delivery = app(TenantContext::class)->run($actor->tenant_id, fn () => OrderDelivery::firstOrFail());
        $this->postJson('/api/v1/deliveries/'.$delivery->id.'/status', [...$key(), 'revision' => 1, 'status' => 'assigned', 'courier_id' => $courier])->assertOk();
        $this->postJson('/api/v1/deliveries/'.$delivery->id.'/status', [...$key(), 'revision' => 2, 'status' => 'out_for_delivery'])->assertOk();
        $job = ['operation' => 'courier.collect', 'actor_id' => $actor->id, 'resource_id' => $delivery->id, 'data' => [...$key(), 'delivery_revision' => 3, 'order_revision' => 3, 'settings_revision' => 2, 'expected_total' => '100.01', 'received_amount' => '110', 'confirmed_received' => true, 'reason' => 'Cobro recibido en reparto']];
        $this->assertSame([true, true], array_column($this->race([$job, $job]), 'accepted'));
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 0);
        $collection = app(TenantContext::class)->run($actor->tenant_id, fn () => CourierCollection::firstOrFail());
        $register = $this->getJson('/api/v1/cash/registers')->assertOk()->json('data.0.id');
        $cash = $this->postJson('/api/v1/cash/registers/'.$register.'/open', [...$key(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $job = ['operation' => 'courier.settle', 'actor_id' => $actor->id, 'resource_id' => $collection->id, 'data' => [...$key(), 'collection_revision' => 1, 'expected_pending' => '100.01', 'amount' => '60', 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'confirmed_handover' => true, 'reason' => 'Ingreso físico a caja']];
        $other = $job;
        $other['data']['idempotency_key'] = (string) Str::uuid();
        $accepted = array_column($this->race([$job, $other]), 'accepted');
        sort($accepted);
        $this->assertSame([false, true], $accepted);
        $this->assertDatabaseCount('courier_settlements', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseHas('cash_sessions', ['id' => $cash['id'], 'expected_amount' => '1060.0000']);
    }
}
