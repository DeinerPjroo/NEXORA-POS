<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class DeliveryTariffTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private array $item;

    private array $profile;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('fees@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        [$this->branch, $this->item] = $this->scope(function () {
            $c = Category::create(['name' => 'Carta', 'color' => '#7258df']);
            $p = Product::create(['name' => 'Pizza', 'sku' => 'FEE', 'category_id' => $c->id, 'sale_price' => '18000', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, ['product_id' => $p->id, 'product_revision' => 1, 'quantity' => 1, 'expected_unit_price' => '18000']];
        });
        $this->profile = $this->postJson('/api/v1/tax-profiles', [...$this->key(), 'name' => 'Tasa ficticia de pruebas', 'price_mode' => 'exclusive', 'rates' => [['name' => 'Prueba', 'rate' => '8']], 'is_active' => true])->assertCreated()->json('data');
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Tarifas', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function scope(callable $f): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $f);
    }

    private function policy(array $extra = []): array
    {
        return $this->putJson('/api/v1/deliveries/tariff-settings', [...$this->key(), 'branch_id' => $this->branch, 'revision' => 0, 'currency' => 'COP', 'is_enabled' => true, 'default_fee' => '3000', 'free_from' => null, 'tax_profile_id' => $this->profile['id'], 'tax_profile_revision' => 1, ...$extra])->assertOk()->json('data');
    }

    private function preview(array $extra = [], string $subtotal = '18000'): array
    {
        return $this->postJson('/api/v1/deliveries/fee-preview', ['branch_id' => $this->branch, 'currency' => 'COP', 'product_subtotal' => $subtotal, ...$extra])->assertOk()->json('data');
    }

    private function orderBody(array $plan, array $extra = []): array
    {
        return [...$this->key(), 'branch_id' => $this->branch, 'currency' => 'COP', 'channel' => 'delivery', 'items' => [$this->item], 'delivery' => ['recipient_name' => 'Laura', 'phone' => '3001234567', 'address' => 'Calle 10 número 20', 'fee_policy_revision' => $plan['fee_snapshot']['policy_revision'] ?? 0, 'fee_profile_revision' => $plan['fee_snapshot']['profile']['revision'] ?? 1, 'expected_fee_total' => $plan['fee_total'], ...($plan['delivery_zone_id'] ? ['delivery_zone_id' => $plan['delivery_zone_id'], 'fee_zone_revision' => $plan['fee_snapshot']['zone_revision']] : []), ...$extra]];
    }

    private function configureSales(): array
    {
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Sin impuesto', 'tax_rate' => '0'])->assertOk();
        $id = $this->getJson('/api/v1/cash/registers')->json('data.0.id');

        return $this->postJson('/api/v1/cash/registers/'.$id.'/open', [...$this->key(), 'opening_amount' => '0', 'currency' => 'COP'])->assertCreated()->json('data');
    }

    public function test_delivery_additions_keep_fee_snapshot_even_when_free_threshold_is_crossed_and_sale_blocks_more(): void
    {
        $this->policy(['free_from' => '36000']);
        $order = $this->postJson('/api/v1/orders', $this->orderBody($this->preview()))->assertCreated()->json('data');
        $body = [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'delivery', 'currency' => 'COP', 'append_order_id' => $order['id'], 'order_revision' => $order['revision'], 'delivery_revision' => $order['delivery_revision'], 'items' => [$this->item]];
        $next = $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.subtotal', '36000.0000')->assertJsonPath('data.delivery_fee_total', '3240.0000')->json('data');
        $this->assertSame($order['delivery_charge'], $next['delivery_charge']);
        $cash = $this->configureSales();
        $this->postJson('/api/v1/orders/'.$order['id'].'/collect', [...$this->key(), 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'order_revision' => $next['revision'], 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '39240.00', 'received_amount' => '40000'])->assertCreated()->assertJsonPath('data.total', '39240.0000');
        $this->postJson('/api/v1/orders', [...$body, ...$this->key(), 'order_revision' => $next['revision'], 'delivery_revision' => $next['delivery_revision']])->assertConflict();
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('order_items', 2);
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.delivery_revision', $next['delivery_revision']);
    }

    public function test_fixed_zone_free_and_manual_tariffs_are_authoritative_and_revisioned(): void
    {
        $p = $this->policy(['free_from' => '36000']);
        $this->assertSame('3240.0000', $this->preview()['fee_total']);
        $p = $this->postJson('/api/v1/deliveries/policies/'.$p['id'].'/zones', [...$this->key(), 'revision' => 1, 'name' => 'Centro', 'fee' => '5000', 'is_active' => true])->assertOk()->json('data');
        $z = $p['zones'][0];
        $zone = $this->preview(['delivery_zone_id' => $z['id']]);
        $this->assertSame('5400.0000', $zone['fee_total']);
        $free = $this->preview(['delivery_zone_id' => $z['id']], '36000');
        $this->assertSame('0.0000', $free['fee_total']);
        $manual = $this->preview(['fee_override' => '1000', 'fee_override_reason' => 'Ajuste autorizado de prueba']);
        $this->assertSame('1080.0000', $manual['fee_total']);
        $body = $this->orderBody($zone);
        $this->postJson('/api/v1/orders', [...$body, 'delivery' => [...$body['delivery'], 'expected_fee_total' => '0']])->assertConflict();
        $o = $this->postJson('/api/v1/orders', $body)->assertCreated()->json('data');
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.id', $o['id']);
        $this->assertDatabaseHas('order_deliveries', ['order_id' => $o['id'], 'fee_total' => '5400']);
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_shipping_is_charged_once_in_the_existing_sale_payment_and_cash_ledger(): void
    {
        $this->policy();
        $plan = $this->preview();
        $o = $this->postJson('/api/v1/orders', $this->orderBody($plan))->assertCreated()->json('data');
        $cash = $this->configureSales();
        $quote = $this->getJson('/api/v1/orders/'.$o['id'].'/quote?discount_amount=1000')->assertOk()->assertJsonPath('data.total', '20240.0000')->assertJsonPath('data.tax_amount', '240.0000')->assertJsonPath('data.calculation_version', 4)->json('data');
        $payload = [...$this->key(), 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '1000', 'discount_reason' => 'Prueba autorizada', 'expected_total' => bcadd($quote['total'], '0', 2), 'received_amount' => '21000'];
        $sale = $this->postJson('/api/v1/orders/'.$o['id'].'/collect', $payload)->assertCreated()->assertJsonPath('data.delivery_fee_total', '3240.0000')->assertJsonPath('data.payment.change_amount', '760.0000')->json('data');
        $this->postJson('/api/v1/orders/'.$o['id'].'/collect', $payload)->assertCreated()->assertJsonPath('data.id', $sale['id']);
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 1);
        $this->getJson('/api/v1/cash/sessions/'.$cash['id'])->assertJsonPath('data.expected_amount', '20240.0000');
        $this->scope(fn () => $this->assertSame('240.0000', Sale::findOrFail($sale['id'])->delivery_charge['tax_amount']));
        $refund = [...$this->key(), 'cash_session_id' => $cash['id'], 'cash_revision' => 2, 'reason' => 'Devolución de prueba incluido domicilio'];
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', $refund)->assertOk()->assertJsonPath('data.refund.amount', '20240.0000')->assertJsonPath('data.delivery_fee_total', '3240.0000');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', $refund)->assertOk();
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseCount('cash_movements', 2);
        $this->getJson('/api/v1/cash/sessions/'.$cash['id'])->assertJsonPath('data.expected_amount', '0.0000');
    }

    public function test_tax_and_policy_changes_do_not_reprice_saved_fees_and_stale_commands_are_rejected(): void
    {
        $p = $this->policy();
        $plan = $this->preview();
        $body = $this->orderBody($plan);
        $o = $this->postJson('/api/v1/orders', $body)->assertCreated()->json('data');
        $this->putJson('/api/v1/tax-profiles/'.$this->profile['id'], ['revision' => 1, 'name' => 'Tasa modificada de prueba', 'price_mode' => 'exclusive', 'rates' => [['name' => 'Prueba', 'rate' => '16']], 'is_active' => true])->assertOk();
        $this->postJson('/api/v1/orders', [...$body, ...$this->key()])->assertConflict();
        $this->configureSales();
        $this->getJson('/api/v1/orders/'.$o['id'].'/quote?discount_amount=0')->assertOk()->assertJsonPath('data.total', '21240.0000')->assertJsonPath('data.delivery_charge.profile.rates.0.rate', '8.0000');
        $this->policy(['revision' => 1, 'default_fee' => '9000', 'tax_profile_revision' => 2]);
        $this->getJson('/api/v1/orders/'.$o['id'].'/quote?discount_amount=0')->assertJsonPath('data.total', '21240.0000');
        $this->assertDatabaseCount('orders', 1);
    }

    public function test_tariff_configuration_override_and_foreign_branch_are_denied_in_backend(): void
    {
        $this->policy();
        $staff = $this->scope(fn () => User::factory()->create(['role_id' => Role::where('name', 'Cajero')->firstOrFail()->id]));
        $this->actingAs($staff)->getJson('/api/v1/deliveries/tariff-settings?branch_id='.$this->branch)->assertForbidden();
        $this->postJson('/api/v1/deliveries/fee-preview', ['branch_id' => $this->branch, 'currency' => 'COP', 'product_subtotal' => '18000', 'fee_override' => '0', 'fee_override_reason' => 'Sin autorización'])->assertForbidden();
        $this->getJson('/api/v1/deliveries/tariff-context?branch_id='.$this->branch)->assertOk();
        $other = $this->company('other-fees@example.test');
        $this->actingAs($other);
        $this->getJson('/api/v1/deliveries/tariff-settings?branch_id='.$this->branch)->assertNotFound();
        $this->postJson('/api/v1/deliveries/fee-preview', ['branch_id' => $this->branch, 'currency' => 'COP', 'product_subtotal' => '18000'])->assertNotFound();
    }

    public function test_included_shipping_tax_is_not_added_twice_and_discount_does_not_erase_shipping(): void
    {
        $this->putJson('/api/v1/tax-profiles/'.$this->profile['id'], ['revision' => 1, 'name' => 'Incluido ficticio', 'price_mode' => 'inclusive', 'rates' => [['name' => 'Prueba', 'rate' => '20']], 'is_active' => true])->assertOk();
        $this->policy(['default_fee' => '100', 'tax_profile_revision' => 2]);
        $plan = $this->preview();
        $this->assertSame('100.0000', $plan['fee_total']);
        $this->assertSame('16.6700', $plan['fee_snapshot']['tax_amount']);
        $o = $this->postJson('/api/v1/orders', $this->orderBody($plan))->assertCreated()->json('data');
        $this->configureSales();
        $this->getJson('/api/v1/orders/'.$o['id'].'/quote?discount_amount=18000')->assertOk()->assertJsonPath('data.total', '100.0000')->assertJsonPath('data.tax_amount', '16.6700');
    }

    public function test_delivery_fees_preserve_global_and_product_tax_calculations(): void
    {
        $this->policy();
        $this->configureSales();
        foreach ([['exclusive', '22680.0000', '1680.0000'], ['inclusive', '21240.0000', '1573.3300'], ['product', '21240.0000', '240.0000']] as $i => [$mode, $total, $tax]) {
            $this->putJson('/api/v1/sales/settings', ['revision' => 2 + $i, 'confirmed' => true, 'tax_mode' => $mode, 'tax_name' => 'Prueba de impuestos', 'tax_rate' => $mode === 'product' ? '0' : '8'])->assertOk();
            $o = $this->postJson('/api/v1/orders', $this->orderBody($this->preview()))->assertCreated()->json('data');
            $this->getJson('/api/v1/orders/'.$o['id'].'/quote?discount_amount=0')->assertOk()->assertJsonPath('data.total', $total)->assertJsonPath('data.tax_amount', $tax)->assertJsonPath('data.delivery_fee_total', '3240.0000');
        }
    }

    public function test_delivery_preview_uses_catalog_and_shared_sale_totals_without_creating_orders(): void
    {
        $this->policy(['free_from' => '20000']);
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Sin impuesto', 'tax_rate' => '0'])->assertOk();
        $body = ['branch_id' => $this->branch, 'currency' => 'COP', 'product_subtotal' => '999999', 'items' => [$this->item]];
        $this->postJson('/api/v1/deliveries/fee-preview', $body)->assertOk()->assertJsonPath('data.product_subtotal', '18000.0000')->assertJsonPath('data.fee_total', '3240.0000')->assertJsonPath('data.quote.total', '21240.0000');
        $this->postJson('/api/v1/deliveries/fee-preview', [...$body, 'items' => [[...$this->item, 'expected_unit_price' => '1']]])->assertConflict();
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_sessions', 0);
    }
}
