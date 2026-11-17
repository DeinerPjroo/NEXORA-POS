<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Sales\SplitAccounts;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\SaleAccount;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class SplitAccountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'split@example.test', string $price = '100.01'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        [$branch, $product] = app(TenantContext::class)->run($owner->tenant_id, function () use ($price) {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Menú', 'sku' => 'MENU', 'category_id' => $category->id, 'sale_price' => $price, 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id];
        });
        $order = $this->order(compact('branch', 'product', 'price'));
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Impuesto', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $cash = $this->getJson('/api/v1/payment-methods')->json('data.0');
        $transfer = $this->postJson('/api/v1/payment-methods', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Transferencia manual', 'code' => 'transfer', 'kind' => 'non_cash', 'is_active' => true])->assertCreated()->json('data');

        return compact('owner', 'branch', 'product', 'price', 'order', 'session', 'cash', 'transfer');
    }

    private function order(array $work): array
    {
        return $this->postJson('/api/v1/orders', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $work['branch'], 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $work['product'], 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => $work['price']]]])->assertCreated()->json('data');
    }

    private function collectData(array $work, array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => $work['price'], 'split_count' => 3, 'account_number' => 2, 'payment_amount' => '10', 'received_amount' => '20', ...$extra];
    }

    private function collect(array $work): array
    {
        return $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->collectData($work))->assertCreated()->json('data');
    }

    private function batch(array $work, array $sale, array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'expected_balance' => '90.01', 'payments' => [
            ['account_id' => $sale['accounts'][1]['id'], 'payment_method_id' => $work['cash']['id'], 'method_revision' => 1, 'amount' => '5', 'received_amount' => '10'],
            ['account_id' => $sale['accounts'][1]['id'], 'payment_method_id' => $work['transfer']['id'], 'method_revision' => 1, 'amount' => '18.34', 'received_amount' => '18.34', 'reference' => 'PART-2'],
        ], ...$extra];
    }

    public function test_quote_and_sale_distribute_cents_exactly_and_allocate_first_payment(): void
    {
        $work = $this->work();
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_amount=0&split_count=3')->assertOk()
            ->assertJsonPath('data.accounts_preview.0.amount', '33.3400')->assertJsonPath('data.accounts_preview.1.amount', '33.3400')->assertJsonPath('data.accounts_preview.2.amount', '33.3300');
        $sale = $this->collect($work);
        $this->assertSame('100.0100', $sale['total']);
        $this->assertSame('90.0100', $sale['balance_due']);
        $this->assertSame('23.3400', $sale['accounts'][1]['balance_due']);
        $this->assertSame($sale['accounts'][1]['id'], $sale['payments'][0]['account_id']);
        $this->assertSame($sale['payments'][0]['account_id'], $sale['payment']['account_id']);
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('sale_accounts', 3);
        $this->getJson('/api/v1/sales')->assertJsonPath('data.0.accounts.1.paid_amount', '10.0000');
    }

    public function test_same_account_mixed_batch_caps_aggregate_allocation_and_replays_without_duplicates(): void
    {
        $work = $this->work();
        $sale = $this->collect($work);
        $data = $this->batch($work, $sale);
        $path = '/api/v1/sales/'.$sale['id'].'/payments';
        $bad = $data;
        $bad['payments'][1]['amount'] = '18.35';
        $bad['payments'][1]['received_amount'] = '18.35';
        $this->postJson($path, $bad)->assertUnprocessable();
        $this->assertDatabaseCount('payments', 1);
        $this->postJson($path, $data)->assertOk()->assertJsonPath('data.accounts.1.balance_due', '0.0000')->assertJsonPath('data.accounts.1.paid_amount', '33.3400')->assertJsonPath('data.balance_due', '66.6700');
        $this->postJson($path, $data)->assertOk();
        $this->assertDatabaseCount('payments', 3);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1015.0000')->assertJsonPath('data.revision', 4);
    }

    public function test_mixed_batch_across_accounts_can_settle_sale_without_overpayment(): void
    {
        $work = $this->work();
        $sale = $this->collect($work);
        $data = $this->batch($work, $sale);
        $data['payments'] = [];
        foreach (['33.34', '23.34', '33.33'] as $index => $amount) {
            $data['payments'][] = ['account_id' => $sale['accounts'][$index]['id'], 'payment_method_id' => $work['transfer']['id'], 'method_revision' => 1, 'amount' => $amount, 'received_amount' => $amount, 'reference' => 'CUENTA-'.($index + 1)];
        }
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $data)->assertOk()->assertJsonPath('data.status', 'paid')->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.accounts.0.balance_due', '0.0000')->assertJsonPath('data.accounts.2.balance_due', '0.0000');
    }

    public function test_initial_overpayment_bad_split_and_missing_account_do_not_create_financial_rows(): void
    {
        $work = $this->work();
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        foreach ([['payment_amount' => '33.35'], ['account_number' => 4], ['split_count' => 1], ['split_count' => 21]] as $extra) {
            $this->postJson($path, $this->collectData($work, $extra))->assertUnprocessable();
        }
        $data = $this->collectData($work);
        unset($data['account_number']);
        $this->postJson($path, $data)->assertUnprocessable();
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('sale_accounts', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000')->assertJsonPath('data.revision', 1);
    }

    public function test_initial_default_pays_selected_part_and_replay_creates_accounts_only_once(): void
    {
        $work = $this->work();
        $data = $this->collectData($work, ['received_amount' => '40']);
        unset($data['payment_amount']);
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $this->postJson($path, $data)->assertCreated()->assertJsonPath('data.paid_amount', '33.3400')->assertJsonPath('data.accounts.1.balance_due', '0.0000');
        $this->postJson($path, $data)->assertCreated();
        $this->postJson($path, [...$data, 'account_number' => 1])->assertConflict();
        $this->assertDatabaseCount('sale_accounts', 3);
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_refunds_keep_original_account_debt_and_full_close_cancels_only_unpaid_parts(): void
    {
        $work = $this->work();
        $sale = $this->collect($work);
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->batch($work, $sale))->assertOk();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refunds', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 4, 'sale_revision' => 3, 'expected_refundable' => '33.34', 'reason' => 'Ajuste de cuenta dos', 'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '5']]])->assertOk()->assertJsonPath('data.accounts.1.balance_due', '0.0000')->assertJsonPath('data.accounts.1.refunded_amount', '5.0000')->assertJsonPath('data.accounts.1.net_paid_amount', '28.3400')->assertJsonPath('data.balance_due', '66.6700');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 5, 'sale_revision' => 4, 'reason' => 'Cerrar todas las partes', 'refund_reference' => 'CIERRE-2'])->assertOk()
            ->assertJsonPath('data.cancelled_balance', '66.6700')->assertJsonPath('data.accounts.0.cancelled_balance', '33.3400')->assertJsonPath('data.accounts.2.cancelled_balance', '33.3300')->assertJsonPath('data.accounts.1.cancelled_balance', '0.0000')->assertJsonPath('data.accounts.1.effective_total', '0.0000');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }

    public function test_bad_later_reference_rolls_back_allocations_and_cash(): void
    {
        $work = $this->work();
        $sale = $this->collect($work);
        $data = $this->batch($work, $sale);
        unset($data['payments'][1]['reference']);
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $data)->assertUnprocessable();
        $this->assertDatabaseCount('payments', 1);
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertJsonPath('data.accounts.1.balance_due', '23.3400')->assertJsonPath('data.revision', 2);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1010.0000')->assertJsonPath('data.revision', 2);
    }

    public function test_account_assignment_required_and_cannot_split_again_after_first_payment(): void
    {
        $work = $this->work();
        $sale = $this->collect($work);
        $data = $this->batch($work, $sale);
        unset($data['payments'][1]['account_id']);
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $data)->assertUnprocessable();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->batch($work, $sale, ['split_count' => 2]))->assertUnprocessable();
        $this->assertDatabaseCount('sale_accounts', 3);
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_foreign_account_is_rejected_and_no_cross_tenant_data_is_exposed(): void
    {
        $first = $this->work();
        $sale = $this->collect($first);
        $second = $this->work('other-split@example.test');
        $other = $this->collect($second);
        $data = $this->batch($second, $other);
        $data['payments'][1]['account_id'] = $sale['accounts'][1]['id'];
        $this->postJson('/api/v1/sales/'.$other['id'].'/payments', $data)->assertNotFound();
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertNotFound();
        $this->assertDatabaseCount('payments', 2);
    }

    public function test_same_tenant_account_from_another_sale_fails_service_and_composite_fk(): void
    {
        $work = $this->work();
        $sale = $this->collect($work);
        $order = $this->order($work);
        $other = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', $this->collectData($work, ['cash_revision' => 2]))->assertCreated()->json('data');
        $data = $this->batch($work, $sale, ['cash_revision' => 3]);
        $data['payments'][1]['account_id'] = $other['accounts'][1]['id'];
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $data)->assertNotFound();
        $this->assertDatabaseCount('payments', 2);
        $this->expectException(QueryException::class);
        DB::table('payments')->where('id', $sale['payments'][0]['id'])->update(['account_id' => $other['accounts'][1]['id']]);
    }

    public function test_unsplit_sale_preserves_null_assignments_and_cannot_import_an_account(): void
    {
        $work = $this->work();
        $data = $this->collectData($work);
        unset($data['split_count'], $data['account_number']);
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $data)->assertCreated()->assertJsonPath('data.accounts', [])->assertJsonPath('data.payment.account_id', null)->json('data');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->batch($work, ['accounts' => [[], ['id' => 999999]]]))->assertUnprocessable();
        $this->assertDatabaseCount('sale_accounts', 0);
    }

    public function test_audit_failure_rolls_back_account_creation_sale_payment_and_sequence(): void
    {
        $work = $this->work();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'sale.partially_paid') {
                throw new \RuntimeException('Auditoría de división fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->collect($work);
            $this->fail('La división y el primer pago deben confirmar juntos.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de división fallida', $error->getMessage());
        }
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('sale_accounts', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertSame(1, (int) DB::table('sales_settings')->value('next_receipt_number'));
    }

    public function test_too_small_parts_are_rejected_and_extreme_cent_distribution_is_exact(): void
    {
        $work = $this->work(price: '0.02');
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_amount=0&split_count=3')->assertUnprocessable();
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->collectData($work))->assertUnprocessable();
        $this->assertDatabaseCount('sale_accounts', 0);
        $plan = app(SplitAccounts::class)->plan('999999999999999.9900', 20);
        $this->assertSame('50000000000000.0000', $plan[0]['amount']);
        $this->assertSame('49999999999999.9900', $plan[19]['amount']);
        $this->assertSame('999999999999999.9900', array_reduce($plan, fn ($sum, $part) => bcadd($sum, $part['amount'], 4), '0.0000'));
    }

    public function test_account_amounts_and_labels_remain_append_only(): void
    {
        $work = $this->work();
        $this->collect($work);
        app(TenantContext::class)->run($work['owner']->tenant_id, function () {
            $this->expectException(\LogicException::class);
            SaleAccount::firstOrFail()->update(['amount' => '1']);
        });
    }
}
