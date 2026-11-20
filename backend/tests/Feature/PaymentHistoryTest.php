<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Sales\PaymentHistory;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleRefund;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PaymentHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'history@example.test'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        [$branch, $product] = app(TenantContext::class)->run($owner->tenant_id, function () {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Menú', 'sku' => 'MENU', 'category_id' => $category->id, 'sale_price' => '100.01', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id];
        });
        $order = $this->postJson('/api/v1/orders', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $product, 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.01']]])->assertCreated()->json('data');
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $cash = $this->getJson('/api/v1/payment-methods')->json('data.0');
        $bank = $this->postJson('/api/v1/payment-methods', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Transferencia original', 'code' => 'bank', 'kind' => 'non_cash', 'is_active' => true])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'payment_amount' => '40', 'expected_total' => '100.01', 'received_amount' => '50'])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $session['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'expected_balance' => '60.01', 'payments' => [['payment_method_id' => $bank['id'], 'method_revision' => 1, 'amount' => '60.01', 'received_amount' => '60.01', 'reference' => 'REF%_!LITERAL']]])->assertOk()->json('data');
        $sale = $this->postJson('/api/v1/sales/'.$sale['id'].'/refunds', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $session['id'], 'cash_revision' => 3, 'sale_revision' => 3, 'expected_refundable' => '100.01', 'reason' => 'Devolución para historial', 'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '10'], ['payment_id' => $sale['payments'][1]['id'], 'amount' => '20.01', 'reference' => 'DEV-HIST']]])->assertOk()->json('data');

        return compact('owner', 'branch', 'session', 'sale', 'cash', 'bank');
    }

    public function test_history_reports_payments_and_accumulated_refunds_without_duplicating_sale_total(): void
    {
        $work = $this->work();
        $audit = DB::table('audit_logs')->count();
        $this->getJson('/api/v1/finance/payments')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 2)
            ->assertJsonPath('summary.0.applied_amount', '100.0100')->assertJsonPath('summary.0.refunded_amount', '30.0100')->assertJsonPath('summary.0.net_paid_amount', '70.0000')
            ->assertJsonPath('data.0.applied_amount', '60.0100')->assertJsonPath('data.0.refunded_amount', '20.0100')->assertJsonPath('data.0.net_paid_amount', '40.0000')
            ->assertJsonPath('data.0.provenance', 'operator')->assertJsonPath('data.0.receipt_code', 'V-000001')->assertJsonPath('data.0.sale_revision', 4)->assertJsonPath('data.0.refunds_count', 1)
            ->assertJsonMissingPath('data.0.tenant_id')->assertJsonMissingPath('data.0.expected_amount');
        $this->assertDatabaseCount('audit_logs', $audit);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1030.0000');
    }

    public function test_summary_is_for_current_page_and_filters_use_historical_method_and_literal_reference(): void
    {
        $work = $this->work();
        $this->getJson('/api/v1/finance/payments?per_page=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2)->assertJsonPath('summary.0.count', 1)->assertJsonPath('summary.0.net_paid_amount', '40.0000');
        $this->getJson('/api/v1/finance/payments?per_page=1&page=2')->assertOk()->assertJsonPath('summary.0.net_paid_amount', '30.0000');
        $this->putJson('/api/v1/payment-methods/'.$work['bank']['id'], ['revision' => 1, 'name' => 'Nuevo nombre archivado', 'is_active' => false])->assertOk();
        $this->getJson('/api/v1/finance/payments?method_kind=non_cash&reference='.rawurlencode('%_!'))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.method_name', 'Transferencia original')->assertJsonPath('summary.0.net_paid_amount', '40.0000');
        $this->getJson('/api/v1/finance/payments?method_kind=cash&reference='.rawurlencode('%'))->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('summary', []);
        $this->getJson('/api/v1/finance/payments?reference=&from=&to=&method_kind=')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_company_dates_use_application_storage_timezone_and_exclude_next_midnight(): void
    {
        $work = $this->work();
        foreach (['2026-11-18T04:59:59Z', '2026-11-18T05:00:00Z'] as $index => $instant) {
            DB::table('payments')->where('id', $work['sale']['payments'][$index]['id'])->update(['created_at' => CarbonImmutable::parse($instant)->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s')]);
        }
        $this->getJson('/api/v1/finance/payments?from=2026-11-17&to=2026-11-17')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.method_kind', 'cash')->assertJsonPath('timezone', 'America/Bogota');
        $this->getJson('/api/v1/finance/payments?from=2026-11-18')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.method_kind', 'non_cash');
        $this->getJson('/api/v1/finance/payments?to=2026-11-17')->assertOk()->assertJsonCount(1, 'data');
        DB::table('tenants')->where('id', $work['owner']->tenant_id)->update(['timezone' => 'Europe/Madrid']);
        $this->actingAs($work['owner']->fresh());
        $this->getJson('/api/v1/finance/payments?from=2026-11-18&to=2026-11-18')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('timezone', 'Europe/Madrid');
    }

    public function test_foreign_branch_and_tenant_filters_are_rejected_and_data_never_crosses_company(): void
    {
        $first = $this->work();
        $second = $this->work('second-history@example.test');
        $this->getJson('/api/v1/finance/payments')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('summary.0.net_paid_amount', '70.0000')->assertJsonMissing(['id' => $first['sale']['payments'][0]['id']]);
        $this->getJson('/api/v1/finance/payments?branch_id='.$first['branch'])->assertUnprocessable();
        $this->getJson('/api/v1/finance/payments?tenant_id='.$first['owner']->tenant_id)->assertUnprocessable();
        $this->getJson('/api/v1/finance/payments?branch_id='.$second['branch'])->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_sales_reader_can_read_history_without_access_to_drawer_balance(): void
    {
        $work = $this->work();
        $role = DB::table('roles')->where('tenant_id', $work['owner']->tenant_id)->where('name', 'Encargado de inventario')->first();
        $user = User::factory()->create(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id]);
        $this->actingAs($user);
        $this->getJson('/api/v1/finance/payments')->assertForbidden();
        DB::table('role_permission')->insert(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'sales.view')->value('id')]);
        $this->actingAs($user->fresh());
        $this->getJson('/api/v1/finance/payments')->assertOk()->assertJsonCount(2, 'data')->assertJsonMissingPath('data.0.expected_amount')->assertJsonMissingPath('data.0.cash_session');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertForbidden();
    }

    public function test_invalid_dates_ranges_and_unbounded_pages_are_rejected(): void
    {
        $this->work();
        foreach (['from=2026-02-30', 'from=yesterday', 'from=2026-11-18&to=2026-11-17', 'per_page=1000', 'page=0', 'method_kind=gateway'] as $query) {
            $this->getJson('/api/v1/finance/payments?'.$query)->assertUnprocessable();
        }
    }

    public function test_summary_uses_exact_decimal_strings_even_above_single_transaction_limit(): void
    {
        $payments = collect();
        foreach (['COP', 'COP', 'USD'] as $currency) {
            $payment = (new Payment(['amount' => '999999999999999.9900']))->setRelation('sale', new Sale(['currency' => $currency]))->setRelation('refunds', collect([new SaleRefund(['amount' => '0.0100'])]));
            $payments->push($payment);
        }
        $summary = app(PaymentHistory::class)->summarize($payments);
        $this->assertSame('1999999999999999.9800', $summary[0]['applied_amount']);
        $this->assertSame('1999999999999999.9600', $summary[0]['net_paid_amount']);
        $this->assertSame('999999999999999.9800', $summary[1]['net_paid_amount']);
        $this->assertSame(2, $summary[0]['count']);
    }
}
