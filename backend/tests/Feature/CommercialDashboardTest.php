<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CommercialDashboardTest extends TestCase
{
    use RefreshDatabase;

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->travelTo(CarbonImmutable::parse('2026-11-18T12:00:00-05:00'));
    }

    private function work(string $email = 'dashboard@example.test', string $currency = 'COP'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        if ($currency !== 'COP') {
            DB::table('tenants')->where('id', $owner->tenant_id)->update(['currency' => $currency]);
        }
        $this->actingAs($owner);
        $base = app(TenantContext::class)->run($owner->tenant_id, function () {
            return ['branch' => Branch::firstOrFail()->id, 'category' => Category::create(['name' => 'Carta', 'color' => '#8271FF'])->id];
        });
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $cash = $this->postJson('/api/v1/cash/registers/'.$register.'/open', [...$this->key(), 'opening_amount' => '1000', 'currency' => $currency])->assertCreated()->json('data');
        $methods = $this->getJson('/api/v1/payment-methods')->json('data');
        $manual = $this->postJson('/api/v1/payment-methods', [...$this->key(), 'name' => 'Transferencia manual', 'code' => 'manual', 'kind' => 'non_cash', 'is_active' => true])->assertCreated()->json('data');

        return [...$base, ...compact('owner', 'cash', 'manual', 'currency'), 'cash_method' => $methods[0]];
    }

    private function cashRevision(array $w): int
    {
        return $this->getJson('/api/v1/cash/sessions/'.$w['cash']['id'])->json('data.revision');
    }

    private function sale(array $w, string $price = '100.01', ?string $partial = null, bool $noncash = false, int $quantity = 1): array
    {
        $product = $this->postJson('/api/v1/products', ['name' => 'Menú histórico', 'sku' => 'SKU'.Str::random(8), 'category_id' => $w['category'], 'sale_price' => $price, 'currency' => $w['currency'], 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $order = $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $w['branch'], 'currency' => $w['currency'], 'channel' => 'takeaway', 'items' => [['product_id' => $product['id'], 'product_revision' => 1, 'expected_unit_price' => $price, 'quantity' => $quantity]]])->assertCreated()->json('data');
        $total = bcadd(bcmul($price, (string) $quantity, 4), '0.005', 2);
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', [...$this->key(), 'cash_session_id' => $w['cash']['id'], 'cash_revision' => $this->cashRevision($w), 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => $total, 'received_amount' => $partial ?? $total, ...($partial ? ['payment_amount' => $partial] : []), ...($noncash ? ['payment_method_id' => $w['manual']['id'], 'method_revision' => 1, 'payment_reference' => 'MANUAL-'.Str::random(5)] : [])])->assertCreated()->json('data');

        return [...$sale, 'product_id' => $product['id'], 'product' => $product];
    }

    private function expense(array $w, string $amount): void
    {
        $this->postJson('/api/v1/cash/sessions/'.$w['cash']['id'].'/movements', [...$this->key(), 'revision' => $this->cashRevision($w), 'type' => 'expense', 'amount' => $amount, 'reason' => 'Egreso manual de prueba'])->assertCreated();
    }

    private function report(string $from = '2026-11-19', string $to = '2026-11-19', string $extra = ''): array
    {
        return $this->getJson('/api/v1/workspace/commercial-dashboard?from='.$from.'&to='.$to.$extra)->assertOk()->json('data');
    }

    public function test_cohorts_event_dates_partial_payments_refunds_and_manual_expenses_are_distinct(): void
    {
        $w = $this->work();
        $sale = $this->sale($w, '100.01', '40');
        $this->expense($w, '7');
        $this->travelTo(CarbonImmutable::parse('2026-11-19T12:00:00-05:00'));
        $sale = $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', [...$this->key(), 'cash_session_id' => $w['cash']['id'], 'cash_revision' => $this->cashRevision($w), 'sale_revision' => $sale['revision'], 'expected_balance' => '60.01', 'payments' => [['payment_method_id' => $w['manual']['id'], 'method_revision' => 1, 'amount' => '60.01', 'received_amount' => '60.01', 'reference' => 'PAGO-MANUAL']]])->assertOk()->json('data');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refunds', [...$this->key(), 'cash_session_id' => $w['cash']['id'], 'cash_revision' => $this->cashRevision($w), 'sale_revision' => $sale['revision'], 'expected_refundable' => '100.01', 'reason' => 'Compensación parcial', 'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '10']]])->assertOk();
        $this->expense($w, '5');
        $before = ['sales' => DB::table('sales')->count(), 'payments' => DB::table('payments')->count(), 'refunds' => DB::table('sale_refunds')->count(), 'audit' => DB::table('audit_logs')->count()];
        $r = $this->report();
        $totals = $r['sales']['currencies'][0];
        $this->assertSame(0, $totals['current']['sales_count']);
        $this->assertSame('0.0000', $totals['current']['sales_total']);
        $this->assertSame('60.0100', $totals['current']['applied_amount']);
        $this->assertSame('10.0000', $totals['current']['refunded_amount']);
        $this->assertSame('50.0100', $totals['current']['net_paid_amount']);
        $this->assertSame('100.0100', $totals['previous']['sales_total']);
        $this->assertSame('40.0000', $totals['previous']['applied_amount']);
        $this->assertSame('0.0000', $totals['previous']['balance_due']);
        $this->assertSame('5.0000', $r['cash_expenses'][0]['amount']);
        $this->assertSame(1, $r['cash_expenses'][0]['count']);
        $this->assertCount(2, $r['sales']['methods']);
        $cash = array_values(array_filter($r['sales']['methods'], fn ($m) => $m['kind'] === 'cash'))[0];
        $this->assertSame('-10.0000', $cash['net_paid_amount']);
        $this->assertSame('Efectivo', $cash['name']);
        $full = $this->report('2026-11-18', '2026-11-19');
        $summary = $full['sales']['currencies'][0]['current'];
        $this->assertSame(1, $summary['sales_count']);
        $this->assertSame(2, $summary['payment_count']);
        $this->assertSame('100.0100', $summary['sales_total']);
        $this->assertSame('90.0100', $summary['net_paid_amount']);
        $this->assertSame('100.0100', $summary['average_ticket']);
        $this->assertSame('12.0000', $full['cash_expenses'][0]['amount']);
        $this->assertSame(1, $full['sales']['products'][0]['quantity']);
        $this->assertSame('Ana', $full['sales']['operators'][0]['name']);
        $this->assertCount(2, $full['sales']['series']);
        $this->assertSame($before, ['sales' => DB::table('sales')->count(), 'payments' => DB::table('payments')->count(), 'refunds' => DB::table('sale_refunds')->count(), 'audit' => DB::table('audit_logs')->count()]);
    }

    public function test_read_permissions_are_separate_and_dashboard_alone_exposes_no_financial_or_live_data(): void
    {
        $w = $this->work();
        $this->sale($w);
        $keep = DB::table('permissions')->where('key', 'dashboard.view')->value('id');
        DB::table('role_permission')->where('role_id', $w['owner']->role_id)->where('permission_id', '!=', $keep)->delete();
        $w['owner']->unsetRelation('role');
        $r = $this->report();
        $this->assertNull($r['sales']);
        $this->assertNull($r['cash_expenses']);
        $this->assertSame(['orders_active' => null, 'tables_occupied' => null, 'cash_sessions_open' => null], $r['live']);
        $this->assertSame(['id', 'name', 'is_active'], array_keys($r['branches'][0]));
        $cashPermission = DB::table('permissions')->where('key', 'cash.view')->value('id');
        DB::table('role_permission')->insert(['tenant_id' => $w['owner']->tenant_id, 'role_id' => $w['owner']->role_id, 'permission_id' => $cashPermission]);
        $w['owner']->unsetRelation('role');
        $cashOnly = $this->report();
        $this->assertNull($cashOnly['sales']);
        $this->assertSame([], $cashOnly['cash_expenses']);
        $this->assertSame(1, $cashOnly['live']['cash_sessions_open']);
        $this->assertNull($cashOnly['live']['orders_active']);
        DB::table('role_permission')->where('role_id', $w['owner']->role_id)->where('permission_id', $cashPermission)->delete();
        DB::table('role_permission')->insert(['tenant_id' => $w['owner']->tenant_id, 'role_id' => $w['owner']->role_id, 'permission_id' => DB::table('permissions')->where('key', 'sales.view')->value('id')]);
        $w['owner']->unsetRelation('role');
        $salesOnly = $this->report('2026-11-18', '2026-11-18');
        $this->assertSame('100.0100', $salesOnly['sales']['currencies'][0]['current']['sales_total']);
        $this->assertNull($salesOnly['cash_expenses']);
        $this->assertNull($salesOnly['live']['cash_sessions_open']);
        DB::table('role_permission')->where('role_id', $w['owner']->role_id)->delete();
        $w['owner']->unsetRelation('role');
        $this->getJson('/api/v1/workspace/commercial-dashboard')->assertForbidden();
    }

    public function test_company_and_branch_filters_reject_foreign_ids_and_do_not_mix_currencies(): void
    {
        $a = $this->work();
        $this->sale($a);
        $b = $this->work('foreign-dashboard@example.test', 'USD');
        $this->sale($b, '19.99', null, true);
        $this->actingAs($a['owner']);
        $r = $this->report('2026-11-18', '2026-11-18', '&branch_id='.$a['branch']);
        $this->assertSame($a['branch'], $r['branch_id']);
        $this->assertCount(1, $r['sales']['currencies']);
        $this->assertSame('COP', $r['sales']['currencies'][0]['currency']);
        $this->assertSame('100.0100', $r['sales']['currencies'][0]['current']['sales_total']);
        $this->assertCount(1, $r['branches']);
        $this->getJson('/api/v1/workspace/commercial-dashboard?branch_id='.$b['branch'])->assertUnprocessable();
        $other = $this->postJson('/api/v1/branches', ['name' => 'Otra sede', 'code' => 'OTRA', 'is_active' => true])->assertCreated()->json('id');
        $r = $this->report('2026-11-18', '2026-11-18', '&branch_id='.$other);
        $this->assertSame('0.0000', $r['sales']['currencies'][0]['current']['sales_total']);
        $this->assertSame(0, $r['live']['orders_active']);
        $this->assertSame([], $r['sales']['products']);
    }

    public function test_company_midnight_timezone_current_metadata_and_bounded_period(): void
    {
        $w = $this->work();
        DB::table('tenants')->where('id', $w['owner']->tenant_id)->update(['timezone' => 'Asia/Kathmandu']);
        $this->travelTo(CarbonImmutable::parse('2026-11-19T18:30:00Z'));
        $this->sale($w, '10');
        $r = $this->report('2026-11-20', '2026-11-20');
        $this->assertSame('Asia/Kathmandu', $r['timezone']);
        $this->assertSame('10.0000', $r['sales']['currencies'][0]['current']['sales_total']);
        $this->assertSame('00', $r['sales']['hours'][0]['hour']);
        $r = $this->report('2026-11-19', '2026-11-19');
        $this->assertSame('0.0000', $r['sales']['currencies'][0]['current']['sales_total']);
        $this->getJson('/api/v1/workspace/commercial-dashboard?from=2026-01-01&to=2026-12-31')->assertUnprocessable();
        $this->getJson('/api/v1/workspace/commercial-dashboard?from=2026-11-20&to=2026-11-19')->assertUnprocessable();
        $this->getJson('/api/v1/workspace/commercial-dashboard?from=2026-02-30')->assertUnprocessable();
    }

    public function test_net_can_be_negative_without_payments_and_refunds_do_not_reopen_debt(): void
    {
        $w = $this->work();
        $sale = $this->sale($w);
        $this->travelTo(CarbonImmutable::parse('2026-11-19T12:00:00-05:00'));
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refunds', [...$this->key(), 'cash_session_id' => $w['cash']['id'], 'cash_revision' => $this->cashRevision($w), 'sale_revision' => $sale['revision'], 'expected_refundable' => '100.01', 'reason' => 'Compensación parcial', 'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '20']]])->assertOk();
        $r = $this->report();
        $t = $r['sales']['currencies'][0];
        $this->assertSame('-20.0000', $t['current']['net_paid_amount']);
        $this->assertSame(0, $t['current']['sales_count']);
        $this->assertSame('0.0000', $t['previous']['balance_due']);
        $this->assertSame('0.0000', $t['current']['applied_amount']);
        $this->assertNull($this->report('2026-11-17', '2026-11-17')['sales']['currencies'][0]['net_change']['percent']);
    }

    public function test_sql_decimal_aggregation_exceeds_single_sale_range_without_float_or_overflow(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            $this->markTestSkipped('La precisión DECIMAL grande se verifica en MariaDB/MySQL, no en NUMERIC de SQLite.');
        }
        $w = $this->work();
        $this->sale($w, '999999999999999.99', null, true);
        $this->sale($w, '999999999999999.99', null, true);
        $r = $this->report('2026-11-18', '2026-11-18');
        $t = $r['sales']['currencies'][0]['current'];
        $this->assertSame('1999999999999999.9800', $t['sales_total']);
        $this->assertSame('1999999999999999.9800', $t['applied_amount']);
        $this->assertSame('999999999999999.9900', $t['average_ticket']);
        $this->assertSame(2, $t['sales_count']);
    }

    public function test_product_ranking_counts_combo_header_and_preserves_sale_snapshot_names(): void
    {
        $w = $this->work();
        $base = ['category_id' => $w['category'], 'currency' => 'COP', 'is_active' => true, 'is_available' => true];
        $a = $this->postJson('/api/v1/products', [...$base, 'name' => 'Pollo', 'sku' => 'POLLO', 'sale_price' => '2'])->assertCreated()->json('data');
        $b = $this->postJson('/api/v1/products', [...$base, 'name' => 'Bebida', 'sku' => 'BEBIDA', 'sale_price' => '1'])->assertCreated()->json('data');
        $root = $this->postJson('/api/v1/products', [...$base, 'kind' => 'combo', 'name' => 'Combo histórico', 'sku' => 'COMBO', 'sale_price' => '10'])->assertCreated()->json('data');
        $components = [];
        foreach ([$a, $b] as $index => $leaf) {
            $part = $this->postJson('/api/v1/products/'.$root['id'].'/combo-components', [...$this->key(), 'product_revision' => $index + 1, 'currency' => 'COP', 'component_product_id' => $leaf['id'], 'component_product_revision' => 1, 'units' => 1, 'position' => $index, 'is_active' => true])->assertCreated()->json('data');
            $components[] = ['component_id' => $part['id'], 'unit_index' => 0];
        }
        $this->putJson('/api/v1/products/'.$root['id'].'/combo-settings', [...$this->key(), 'product_revision' => 3, 'currency' => 'COP', 'allocation_mode' => 'equal'])->assertOk();
        $input = ['branch_id' => $w['branch'], 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['kind' => 'combo', 'product_id' => $root['id'], 'quantity' => 2, 'components' => $components]]];
        $preview = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->json('data.items.0');
        $input['items'][0] = [...$input['items'][0], 'product_revision' => $preview['product_revision'], 'expected_unit_price' => $preview['expected_unit_price'], 'components' => array_map(fn ($p) => array_intersect_key($p, array_flip(['component_id', 'unit_index', 'product_revision', 'expected_tax_revision', 'modifiers', 'notes'])), $preview['components'])];
        $order = $this->postJson('/api/v1/orders', [...$this->key(), ...$input])->assertCreated()->json('data');
        $this->postJson('/api/v1/orders/'.$order['id'].'/collect', [...$this->key(), 'cash_session_id' => $w['cash']['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '20', 'received_amount' => '20'])->assertCreated();
        DB::table('products')->where('id', $root['id'])->update(['name' => 'Nombre actual', 'is_active' => false]);
        $r = $this->report('2026-11-18', '2026-11-18');
        $this->assertCount(1, $r['sales']['products']);
        $this->assertSame('Combo histórico', $r['sales']['products'][0]['name']);
        $this->assertSame(2, $r['sales']['products'][0]['quantity']);
        $this->assertSame(1, $r['sales']['currencies'][0]['current']['sales_count']);
        $this->assertSame('20.0000', $r['sales']['currencies'][0]['current']['sales_total']);
    }
}
