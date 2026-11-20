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

class SaleAdjustmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'adjustments@example.test'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        [$branch, $product] = app(TenantContext::class)->run($owner->tenant_id, function () {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Menú', 'sku' => 'MENU', 'category_id' => $category->id, 'sale_price' => '100.0050', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id];
        });
        $order = $this->postJson('/api/v1/orders', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $product, 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.0050']]])->assertCreated()->json('data');
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');

        return compact('owner', 'order', 'session');
    }

    private function configure(array $extra = []): array
    {
        return $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'exclusive', 'tax_name' => 'Impuesto de prueba', 'tax_rate' => '8.1250', 'tip_enabled' => true, 'tip_tax_mode' => 'excluded', ...$extra])->assertOk()->json('data');
    }

    private function payload(array $work, array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_type' => 'percentage', 'discount_value' => '12.50', 'discount_reason' => 'Descuento autorizado de prueba', 'tip_amount' => '5.25', 'tip_confirmed' => true, 'expected_total' => '99.87', 'received_amount' => '100', ...$extra];
    }

    public function test_tip_starts_disabled_and_enabling_requires_explicit_base_treatment(): void
    {
        $work = $this->work();
        $this->getJson('/api/v1/sales/settings')->assertJsonPath('data.tip_enabled', false)->assertJsonPath('data.tip_tax_mode', null);
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0', 'tip_enabled' => true])->assertUnprocessable();
        $this->configure(['tip_enabled' => false, 'tip_tax_mode' => null]);
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work))->assertUnprocessable();
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_percentage_and_excluded_tip_use_half_up_and_persist_immutable_calculation(): void
    {
        $work = $this->work();
        $this->configure();
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_type=percentage&discount_value=12.50&tip_amount=5.25')->assertOk()->assertJsonPath('data.subtotal', '100.0100')->assertJsonPath('data.discount_amount', '12.5000')->assertJsonPath('data.taxable_base', '87.5100')->assertJsonPath('data.tax_amount', '7.1100')->assertJsonPath('data.total', '99.8700');
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work))->assertCreated()->assertJsonPath('data.discount_type', 'percentage')->assertJsonPath('data.discount_value', '12.5000')->assertJsonPath('data.tip_amount', '5.2500')->assertJsonPath('data.tip_tax_mode', 'excluded')->assertJsonPath('data.tip_confirmed', true)->assertJsonPath('data.payment.change_amount', '0.1300');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1099.8700');
    }

    public function test_included_tip_changes_only_the_confirmed_additional_tax_base(): void
    {
        $work = $this->work();
        $this->configure(['tip_tax_mode' => 'included']);
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_type=percentage&discount_value=12.50&tip_amount=5.25')->assertOk()->assertJsonPath('data.taxable_base', '92.7600')->assertJsonPath('data.tax_amount', '7.5400')->assertJsonPath('data.total', '100.3000');
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work, ['expected_total' => '100.30', 'received_amount' => '150']))->assertCreated()->assertJsonPath('data.payment.change_amount', '49.7000');
    }

    public function test_positive_tip_requires_voluntary_confirmation_but_quotes_do_not_collect(): void
    {
        $work = $this->work();
        $this->configure();
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $payload = $this->payload($work);
        unset($payload['tip_confirmed']);
        $this->postJson($path, $payload)->assertUnprocessable();
        $this->postJson($path, [...$payload, 'tip_confirmed' => false])->assertUnprocessable();
        $this->postJson($path, [...$payload, 'tip_confirmed' => 'inventado'])->assertUnprocessable();
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_invalid_percentage_ambiguous_inputs_and_overflow_never_create_sale(): void
    {
        $work = $this->work();
        $this->configure();
        foreach (['100.01', '-1', '1e2', '12.345'] as $value) {
            $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_type=percentage&discount_value='.urlencode($value))->assertUnprocessable();
        }
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $this->postJson($path, $this->payload($work, ['discount_value' => 12.5]))->assertUnprocessable();
        $this->postJson($path, $this->payload($work, ['discount_amount' => '12.50']))->assertUnprocessable();
        $this->postJson($path, $this->payload($work, ['tip_amount' => '999999999999999.99', 'expected_total' => '999999999999999.99', 'received_amount' => '999999999999999.99']))->assertUnprocessable();
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_discount_and_tip_permissions_are_independent_of_collection(): void
    {
        $work = $this->work();
        $this->configure();
        $role = DB::table('roles')->where('tenant_id', $work['owner']->tenant_id)->where('name', 'Encargado de inventario')->first();
        DB::table('role_permission')->insert(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'sales.collect')->value('id')]);
        $user = User::factory()->create(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id]);
        $this->actingAs($user);
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_type=percentage&discount_value=12.50')->assertForbidden();
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_amount=0&tip_amount=5.25')->assertForbidden();
        DB::table('role_permission')->insert(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'sales.discount')->value('id')]);
        $this->actingAs($user->fresh());
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_type=percentage&discount_value=12.50')->assertOk();
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work))->assertForbidden();
    }

    public function test_installments_and_refund_preserve_original_adjustments_after_settings_change(): void
    {
        $work = $this->work();
        $this->configure();
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work, ['payment_amount' => '40', 'received_amount' => '50']))->assertCreated()->assertJsonPath('data.balance_due', '59.8700')->json('data');
        $this->configure(['revision' => 2, 'tip_tax_mode' => 'included', 'tax_rate' => '1']);
        $method = $this->getJson('/api/v1/payment-methods')->json('data.0');
        $payload = ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'expected_balance' => '59.87', 'payments' => [['payment_method_id' => $method['id'], 'method_revision' => 1, 'amount' => '59.87', 'received_amount' => '60']]];
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', [...$payload, 'tip_amount' => '10'])->assertUnprocessable();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $payload)->assertOk()->assertJsonPath('data.total', '99.8700')->assertJsonPath('data.tip_tax_mode', 'excluded')->assertJsonPath('data.tax_rate', '8.1250');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 3, 'sale_revision' => 3, 'reason' => 'Devolución con propina'])->assertOk()->assertJsonPath('data.refunded_amount', '99.8700')->assertJsonPath('data.tip_amount', '5.2500');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }

    public function test_other_company_does_not_inherit_tip_configuration_or_access_order_quote(): void
    {
        $first = $this->work();
        $this->configure();
        $second = $this->work('other@example.test');
        $this->getJson('/api/v1/sales/settings')->assertJsonPath('data.tip_enabled', false)->assertJsonPath('data.tip_tax_mode', null);
        $this->getJson('/api/v1/orders/'.$first['order']['id'].'/quote?discount_amount=0&tip_amount=5.25')->assertNotFound();
    }
}
