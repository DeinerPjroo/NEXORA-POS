<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Sales\IncludedTax;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Sale;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class IncludedTaxTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'inclusive@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        [$branch, $product] = app(TenantContext::class)->run($owner->tenant_id, function () {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Menú', 'sku' => 'MENU', 'category_id' => $category->id, 'sale_price' => '100.0050', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id];
        });
        $orderData = ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $product, 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.0050']]];
        $order = $this->postJson('/api/v1/orders', $orderData)->assertCreated()->json('data');
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');

        return compact('owner', 'order', 'orderData', 'session');
    }

    private function configure(array $extra = []): array
    {
        return $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'inclusive', 'tax_name' => 'Impuesto de prueba', 'tax_rate' => '10', 'tip_enabled' => true, 'tip_tax_mode' => 'included', ...$extra])->assertOk()->json('data');
    }

    private function payload(array $work, array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '10.01', 'discount_reason' => 'Descuento autorizado', 'tip_amount' => '5.25', 'tip_confirmed' => true, 'expected_total' => '95.25', 'received_amount' => '100', ...$extra];
    }

    public function test_included_tax_extracts_base_and_preserves_final_total_after_discount_and_tip(): void
    {
        $work = $this->work();
        $this->configure();
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_amount=10.01&tip_amount=5.25')->assertOk()->assertJsonPath('data.calculation_version', 2)->assertJsonPath('data.subtotal', '100.0100')->assertJsonPath('data.taxable_base', '86.5900')->assertJsonPath('data.tax_amount', '8.6600')->assertJsonPath('data.total', '95.2500');
        $data = $this->payload($work);
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $this->postJson($path, $data)->assertCreated()->assertJsonPath('data.calculation_version', 2)->assertJsonPath('data.tax_mode', 'inclusive')->assertJsonPath('data.total', '95.2500')->assertJsonPath('data.payment.change_amount', '4.7500');
        $this->postJson($path, $data)->assertCreated();
        $this->assertDatabaseCount('payments', 1);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1095.2500');
    }

    public function test_percentage_discount_and_tip_exclusion_change_extracted_tax_without_changing_gross_total(): void
    {
        $work = $this->work();
        $this->configure();
        $path = '/api/v1/orders/'.$work['order']['id'].'/quote?discount_type=percentage&discount_value=12.50&tip_amount=5.25';
        $this->getJson($path)->assertOk()->assertJsonPath('data.discount_amount', '12.5000')->assertJsonPath('data.taxable_base', '84.3300')->assertJsonPath('data.tax_amount', '8.4300')->assertJsonPath('data.total', '92.7600');
        $this->configure(['revision' => 2, 'tip_tax_mode' => 'excluded']);
        $this->getJson($path)->assertOk()->assertJsonPath('data.taxable_base', '79.5500')->assertJsonPath('data.tax_amount', '7.9600')->assertJsonPath('data.total', '92.7600');
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work))->assertConflict();
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_excluded_tip_is_added_after_extracting_tax_from_discounted_goods_only(): void
    {
        $work = $this->work();
        $this->configure(['tip_tax_mode' => 'excluded']);
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work))->assertCreated()->assertJsonPath('data.taxable_base', '81.8200')->assertJsonPath('data.tax_amount', '8.1800')->assertJsonPath('data.tip_amount', '5.2500')->assertJsonPath('data.total', '95.2500');
    }

    public function test_old_exclusive_sale_keeps_version_and_amounts_after_enabling_included_prices(): void
    {
        $work = $this->work();
        $this->configure(['tax_mode' => 'exclusive', 'tip_enabled' => false, 'tip_tax_mode' => null]);
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work, ['discount_amount' => '0', 'tip_amount' => '0', 'expected_total' => '110.01', 'received_amount' => '120']))->assertCreated()->assertJsonPath('data.calculation_version', 1)->json('data');
        $this->configure(['revision' => 2]);
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertOk()->assertJsonPath('data.calculation_version', 1)->assertJsonPath('data.tax_mode', 'exclusive')->assertJsonPath('data.tax_amount', '10.0000')->assertJsonPath('data.total', '110.0100');
        $order = $this->postJson('/api/v1/orders', [...$work['orderData'], 'idempotency_key' => (string) Str::uuid()])->assertCreated()->json('data');
        $this->getJson('/api/v1/orders/'.$order['id'].'/quote?discount_amount=0')->assertOk()->assertJsonPath('data.calculation_version', 2)->assertJsonPath('data.taxable_base', '90.9200')->assertJsonPath('data.tax_amount', '9.0900')->assertJsonPath('data.total', '100.0100');
    }

    public function test_included_tax_snapshot_survives_split_installments_partial_refund_and_full_close(): void
    {
        $work = $this->work();
        $this->configure();
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work, ['split_count' => 3, 'account_number' => 2, 'payment_amount' => '10', 'received_amount' => '20']))->assertCreated()->assertJsonPath('data.accounts.1.amount', '31.7500')->json('data');
        $cash = $this->getJson('/api/v1/payment-methods')->json('data.0');
        $this->configure(['revision' => 2, 'tax_mode' => 'none', 'tax_rate' => '0']);
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'expected_balance' => '85.25', 'payments' => [['account_id' => $sale['accounts'][1]['id'], 'payment_method_id' => $cash['id'], 'method_revision' => 1, 'amount' => '21.75', 'received_amount' => '25']]])->assertOk()->assertJsonPath('data.tax_mode', 'inclusive')->assertJsonPath('data.calculation_version', 2)->assertJsonPath('data.tax_amount', '8.6600')->assertJsonPath('data.balance_due', '63.5000');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refunds', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 3, 'sale_revision' => 3, 'expected_refundable' => '31.75', 'reason' => 'Ajuste parcial', 'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '5']]])->assertOk()->assertJsonPath('data.accounts.1.balance_due', '0.0000')->assertJsonPath('data.accounts.1.net_paid_amount', '26.7500');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 4, 'sale_revision' => 4, 'reason' => 'Cerrar venta de precio incluido'])->assertOk()->assertJsonPath('data.calculation_version', 2)->assertJsonPath('data.tax_amount', '8.6600')->assertJsonPath('data.total', '95.2500')->assertJsonPath('data.cancelled_balance', '63.5000');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }

    public function test_configuration_still_requires_confirmation_valid_rate_and_voluntary_tip(): void
    {
        $work = $this->work();
        foreach (['-1', '100.0001', '1e1', 10] as $rate) {
            $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'inclusive', 'tax_name' => 'Prueba', 'tax_rate' => $rate])->assertUnprocessable();
        }
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => false, 'tax_mode' => 'inclusive', 'tax_name' => 'Prueba', 'tax_rate' => '10'])->assertUnprocessable();
        $this->configure();
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $this->postJson($path, $this->payload($work, ['tip_confirmed' => false]))->assertUnprocessable();
        $this->postJson($path, $this->payload($work, ['calculation_version' => 1]))->assertUnprocessable();
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_extracting_rounds_base_once_and_preserves_even_one_cent_and_extreme_amounts(): void
    {
        $this->assertSame(['base' => '0.0100', 'tax' => '0.0000'], IncludedTax::extract('0.0100', '100.0000'));
        $this->assertSame(['base' => '0.0200', 'tax' => '0.0100'], IncludedTax::extract('0.0300', '99.9999'));
        $this->assertSame(['base' => '500000000000000.0000', 'tax' => '499999999999999.9900'], IncludedTax::extract('999999999999999.9900', '100'));
        $this->assertSame(['base' => '100.0100', 'tax' => '0.0000'], IncludedTax::extract('100.0100', '0'));
    }

    public function test_calculation_version_is_an_immutable_part_of_the_sale_snapshot(): void
    {
        $work = $this->work();
        $this->configure();
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payload($work))->assertCreated()->json('data');
        app(TenantContext::class)->run($work['owner']->tenant_id, function () use ($sale) {
            $this->expectException(\LogicException::class);
            Sale::findOrFail($sale['id'])->update(['calculation_version' => 1]);
        });
    }
}
