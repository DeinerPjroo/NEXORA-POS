<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PaymentMethodTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function owner(string $email = 'methods@example.test'): User
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);

        return $owner;
    }

    private function method(array $extra = []): array
    {
        return $this->postJson('/api/v1/payment-methods', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Transferencia manual', 'code' => 'transfer', 'kind' => 'non_cash', 'is_active' => true, ...$extra])->assertCreated()->json('data');
    }

    private function work(User $owner): array
    {
        [$branch, $product] = app(TenantContext::class)->run($owner->tenant_id, function () {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Menú de prueba', 'sku' => 'MENU', 'category_id' => $category->id, 'sale_price' => '100.005', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id];
        });
        $order = $this->postJson('/api/v1/orders', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $product, 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.005']]])->assertCreated()->json('data');
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Impuesto adicional', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->assertOk()->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '0', 'currency' => 'COP'])->assertCreated()->json('data');

        return ['order' => $order, 'session' => $session];
    }

    private function payload(array $work, array $method, array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '100.01', 'received_amount' => '100.01', 'payment_method_id' => $method['id'], 'method_revision' => $method['revision'], 'payment_reference' => 'Registro manual REF-001', ...$extra];
    }

    public function test_methods_are_configurable_paginated_idempotent_and_revision_protected(): void
    {
        $this->owner();
        $default = $this->getJson('/api/v1/payment-methods')->assertOk()->assertJsonPath('data.0.code', 'cash')->json('data.0');
        $key = (string) Str::uuid();
        $method = $this->method(['idempotency_key' => $key, 'code' => ' TRANSFER ']);
        $this->method(['idempotency_key' => $key, 'code' => 'transfer']);
        $this->assertDatabaseCount('payment_methods', 2);
        $this->getJson('/api/v1/payment-methods?per_page=1&page=2')->assertOk()->assertJsonPath('meta.total', 2);
        $this->putJson('/api/v1/payment-methods/'.$method['id'], ['name' => 'Transferencias registradas', 'is_active' => false, 'revision' => 1])->assertOk()->assertJsonPath('data.revision', 2);
        $this->putJson('/api/v1/payment-methods/'.$method['id'], ['name' => 'Nombre obsoleto', 'is_active' => true, 'revision' => 1])->assertConflict();
        $this->putJson('/api/v1/payment-methods/'.$method['id'], ['name' => 'Otra', 'is_active' => true, 'revision' => 2, 'kind' => 'cash'])->assertUnprocessable();
        $this->putJson('/api/v1/payment-methods/'.$default['id'], ['name' => 'Efectivo', 'is_active' => false, 'revision' => 1])->assertUnprocessable();
        $this->getJson('/api/v1/payment-methods?status=inactive')->assertJsonCount(1, 'data');
    }

    public function test_manual_non_cash_payment_preserves_snapshot_and_never_changes_cash(): void
    {
        $work = $this->work($this->owner());
        $method = $this->method();
        $payload = $this->payload($work, $method);
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $sale = $this->postJson($path, $payload)->assertCreated()->assertJsonPath('data.payment.provenance', 'operator')->assertJsonPath('data.payment.method_kind', 'non_cash')->assertJsonPath('data.payment.change_amount', '0.0000')->json('data');
        $this->postJson($path, $payload)->assertCreated()->assertJsonPath('data.id', $sale['id']);
        $this->putJson('/api/v1/payment-methods/'.$method['id'], ['name' => 'Nuevo nombre', 'is_active' => false, 'revision' => 1])->assertOk();
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertJsonPath('data.payment.method_name', 'Transferencia manual')->assertJsonPath('data.payment.reference', 'Registro manual REF-001');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '0.0000')->assertJsonPath('data.revision', 2);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertNull(DB::table('payments')->value('cash_movement_id'));
    }

    public function test_reference_exact_amount_and_manual_provenance_are_enforced(): void
    {
        $work = $this->work($this->owner());
        $method = $this->method();
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        foreach ([['payment_reference' => null], ['received_amount' => '200'], ['provenance' => 'gateway'], ['provider_confirmed' => true]] as $extra) {
            $this->postJson($path, $this->payload($work, $method, $extra))->assertUnprocessable();
        }
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_inactive_or_stale_methods_cannot_create_payments(): void
    {
        $work = $this->work($this->owner());
        $method = $this->method();
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $this->postJson($path, $this->payload($work, $method, ['method_revision' => 2]))->assertConflict();
        $this->putJson('/api/v1/payment-methods/'.$method['id'], ['name' => $method['name'], 'is_active' => false, 'revision' => 1])->assertOk();
        $this->postJson($path, $this->payload($work, $method, ['method_revision' => 2]))->assertConflict();
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_non_cash_refund_uses_original_method_even_if_archived_and_is_idempotent(): void
    {
        $work = $this->work($this->owner());
        $method = $this->method();
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work, $method))->assertCreated()->json('data');
        $this->putJson('/api/v1/payment-methods/'.$method['id'], ['name' => 'Archivado', 'is_active' => false, 'revision' => 1])->assertOk();
        $path = '/api/v1/sales/'.$sale['id'].'/refund';
        $payload = ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'reason' => 'Devolución registrada'];
        $this->postJson($path, $payload)->assertUnprocessable();
        $payload['refund_reference'] = 'REF-DEV-001';
        $this->postJson($path, $payload)->assertOk()->assertJsonPath('data.status', 'refunded')->assertJsonPath('data.refund.reference', 'REF-DEV-001');
        $this->postJson($path, $payload)->assertOk();
        $this->postJson($path, [...$payload, 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '0.0000')->assertJsonPath('data.revision', 3);
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_method_tenant_is_enforced_in_routes_services_and_foreign_key(): void
    {
        $first = $this->owner();
        $method = $this->method();
        $second = $this->owner('other@example.test');
        $work = $this->work($second);
        $this->getJson('/api/v1/payment-methods')->assertJsonCount(1, 'data');
        $this->putJson('/api/v1/payment-methods/'.$method['id'], ['name' => 'Ajeno', 'is_active' => true, 'revision' => 1])->assertNotFound();
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work, $method))->assertNotFound();
        $own = $this->method();
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work, $own))->assertCreated()->json('data');
        $this->expectException(QueryException::class);
        DB::table('payments')->where('sale_id', $sale['id'])->update(['payment_method_id' => $method['id']]);
    }

    public function test_unprivileged_role_cannot_configure_or_view_methods(): void
    {
        $owner = $this->owner();
        $role = DB::table('roles')->where('tenant_id', $owner->tenant_id)->where('name', 'Encargado de inventario')->first();
        $user = User::factory()->create(['tenant_id' => $owner->tenant_id, 'role_id' => $role->id]);
        $this->actingAs($user);
        $this->getJson('/api/v1/payment-methods')->assertForbidden();
        $this->postJson('/api/v1/payment-methods', ['name' => 'Sin permiso'])->assertForbidden();
    }

    public function test_configured_cash_method_keeps_legacy_cash_ledger_behavior(): void
    {
        $work = $this->work($this->owner());
        $method = $this->method(['name' => 'Efectivo operativo', 'code' => 'cash_ops', 'kind' => 'cash']);
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work, $method, ['received_amount' => '200']))->assertCreated()->assertJsonPath('data.payment.change_amount', '99.9900')->json('data');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '100.0100');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'reason' => 'Devolución en efectivo'])->assertOk();
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '0.0000');
        $this->assertDatabaseCount('cash_movements', 2);
    }
}
