<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\SaleRefund;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class PartialRefundTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'refund@example.test', bool $mixed = true): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        [$branch, $product] = app(TenantContext::class)->run($owner->tenant_id, function () {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Menú', 'sku' => 'MENU', 'category_id' => $category->id, 'sale_price' => '100.01', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id];
        });
        $order = $this->postJson('/api/v1/orders', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $product, 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.01']]])->assertCreated()->json('data');
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Impuesto', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $transfer = $this->postJson('/api/v1/payment-methods', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Transferencia manual', 'code' => 'transfer', 'kind' => 'non_cash', 'is_active' => true])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '100.01', 'payment_amount' => '40', 'received_amount' => '50'])->assertCreated()->json('data');
        if ($mixed) {
            $sale = $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $session['id'], 'cash_revision' => 2, 'sale_revision' => $sale['revision'], 'expected_balance' => '60.01', 'payments' => [['payment_method_id' => $transfer['id'], 'method_revision' => 1, 'amount' => '60.01', 'received_amount' => '60.01', 'reference' => 'BANK-1']]])->assertOk()->json('data');
        }

        return compact('owner', 'branch', 'product', 'session', 'sale', 'transfer');
    }

    private function payload(array $work, array $extra = []): array
    {
        $sale = $work['sale'];

        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 3,
            'sale_revision' => $sale['revision'], 'expected_refundable' => '100.01', 'reason' => 'Devolución parcial solicitada',
            'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '10'], ['payment_id' => $sale['payments'][1]['id'] ?? 0, 'amount' => '20.01', 'reference' => 'BANK-DEV-1']], ...$extra];
    }

    private function path(array $work): string
    {
        return '/api/v1/sales/'.$work['sale']['id'].'/refunds';
    }

    public function test_partial_mixed_refund_is_idempotent_and_exposes_remaining_per_original_payment(): void
    {
        $work = $this->work();
        $data = $this->payload($work);
        $this->postJson($this->path($work), $data)->assertOk()->assertJsonPath('data.status', 'partially_refunded')->assertJsonPath('data.total', '100.0100')
            ->assertJsonPath('data.refunded_amount', '30.0100')->assertJsonPath('data.net_paid_amount', '70.0000')->assertJsonPath('data.effective_total', '70.0000')
            ->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.payments.0.refundable_amount', '30.0000')->assertJsonPath('data.payments.1.refundable_amount', '40.0000')->assertJsonPath('data.payment.refunded_amount', '10.0000');
        $this->postJson($this->path($work), $data)->assertOk();
        $this->postJson($this->path($work), [...$data, 'reason' => 'Otra razón'])->assertConflict();
        $this->assertDatabaseCount('sale_refunds', 2);
        $this->assertDatabaseCount('cash_movements', 2);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1030.0000')->assertJsonPath('data.revision', 5);
        $this->getJson('/api/v1/sales?status=partially_refunded')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_repeated_refund_then_full_close_returns_only_remaining_amounts(): void
    {
        $work = $this->work();
        $this->postJson($this->path($work), $this->payload($work))->assertOk();
        $this->postJson($this->path($work), $this->payload($work, ['sale_revision' => 4, 'cash_revision' => 5, 'expected_refundable' => '70', 'refunds' => [['payment_id' => $work['sale']['payments'][0]['id'], 'amount' => '5']]]))->assertOk()->assertJsonPath('data.payments.0.refundable_amount', '25.0000');
        $full = ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 6, 'sale_revision' => 5, 'reason' => 'Cerrar y devolver remanente', 'refund_reference' => 'BANK-REST'];
        $path = '/api/v1/sales/'.$work['sale']['id'].'/refund';
        $this->postJson($path, $full)->assertOk()->assertJsonPath('data.status', 'refunded')->assertJsonPath('data.refunded_amount', '100.0100')->assertJsonPath('data.net_paid_amount', '0.0000')->assertJsonPath('data.effective_total', '0.0000')->assertJsonCount(5, 'data.refunds');
        $this->postJson($path, $full)->assertOk();
        $this->assertDatabaseCount('sale_refunds', 5);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000')->assertJsonPath('data.revision', 8);
        $this->postJson($this->path($work), $this->payload($work))->assertConflict();
    }

    public function test_refund_does_not_create_debt_and_existing_debt_can_still_be_paid(): void
    {
        $work = $this->work(mixed: false);
        $this->postJson($this->path($work), $this->payload($work, ['cash_revision' => 2, 'expected_refundable' => '40', 'refunds' => [['payment_id' => $work['sale']['payments'][0]['id'], 'amount' => '10']]]))->assertOk()
            ->assertJsonPath('data.balance_due', '60.0100')->assertJsonPath('data.net_paid_amount', '30.0000')->assertJsonPath('data.effective_total', '90.0100')->assertJsonPath('data.cancelled_balance', '0.0000');
        $this->postJson('/api/v1/sales/'.$work['sale']['id'].'/payments', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 3, 'sale_revision' => 3, 'expected_balance' => '60.01', 'payments' => [['payment_method_id' => $work['transfer']['id'], 'method_revision' => 1, 'amount' => '60.01', 'received_amount' => '60.01', 'reference' => 'PAGO-RESTO']]])->assertOk()->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.net_paid_amount', '90.0100')->assertJsonPath('data.status', 'partially_refunded');
    }

    public function test_returning_all_installments_does_not_cancel_unpaid_balance_until_explicit_full_close(): void
    {
        $work = $this->work(mixed: false);
        $this->postJson($this->path($work), $this->payload($work, ['cash_revision' => 2, 'expected_refundable' => '40', 'refunds' => [['payment_id' => $work['sale']['payments'][0]['id'], 'amount' => '40']]]))->assertOk()
            ->assertJsonPath('data.status', 'partially_refunded')->assertJsonPath('data.balance_due', '60.0100')->assertJsonPath('data.net_paid_amount', '0.0000');
        $path = '/api/v1/sales/'.$work['sale']['id'].'/refund';
        $data = ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 3, 'sale_revision' => 3, 'reason' => 'Cancelar saldo nunca cobrado'];
        $this->postJson($path, [...$data, 'cash_revision' => 2])->assertConflict();
        $this->postJson($path, $data)->assertOk()->assertJsonPath('data.status', 'refunded')->assertJsonPath('data.cancelled_balance', '60.0100')->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.effective_total', '0.0000');
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseCount('cash_movements', 2);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000')->assertJsonPath('data.revision', 4);
    }

    public function test_returning_all_payments_on_fully_paid_sale_closes_without_new_debt(): void
    {
        $work = $this->work();
        $lines = [['payment_id' => $work['sale']['payments'][0]['id'], 'amount' => '40'], ['payment_id' => $work['sale']['payments'][1]['id'], 'amount' => '60.01', 'reference' => 'BANK-ALL']];
        $this->postJson($this->path($work), $this->payload($work, ['refunds' => $lines]))->assertOk()->assertJsonPath('data.status', 'refunded')->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.cancelled_balance', '0.0000');
    }

    public function test_stale_revisions_balance_invalid_money_and_overrefund_reject_without_posting(): void
    {
        $work = $this->work();
        foreach (['sale_revision' => 55, 'cash_revision' => 55, 'expected_refundable' => '99'] as $key => $value) {
            $this->postJson($this->path($work), $this->payload($work, [$key => $value]))->assertConflict();
        }
        foreach (['0', '40.01', '-1', '1e1', '10.001', 10] as $amount) {
            $this->postJson($this->path($work), $this->payload($work, ['refunds' => [['payment_id' => $work['sale']['payments'][0]['id'], 'amount' => $amount]]]))->assertUnprocessable();
        }
        $this->assertDatabaseCount('sale_refunds', 0);
        $this->assertDatabaseCount('cash_movements', 1);
        $this->getJson('/api/v1/sales/'.$work['sale']['id'])->assertJsonPath('data.revision', 3);
    }

    public function test_cap_is_cumulative_per_payment_and_unconfirmed_late_line_rolls_back_cash(): void
    {
        $work = $this->work();
        $data = $this->payload($work);
        unset($data['refunds'][1]['reference']);
        $this->postJson($this->path($work), $data)->assertUnprocessable();
        $this->assertDatabaseCount('sale_refunds', 0);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1040.0000')->assertJsonPath('data.revision', 3);
        $this->postJson($this->path($work), $this->payload($work))->assertOk();
        $this->postJson($this->path($work), $this->payload($work, ['sale_revision' => 4, 'cash_revision' => 5, 'expected_refundable' => '70', 'refunds' => [['payment_id' => $work['sale']['payments'][0]['id'], 'amount' => '30.01']]]))->assertUnprocessable();
        $this->assertDatabaseCount('sale_refunds', 2);
    }

    public function test_strict_lines_reject_duplicates_extra_financial_fields_and_non_lists(): void
    {
        $work = $this->work();
        $line = ['payment_id' => $work['sale']['payments'][0]['id'], 'amount' => '1'];
        foreach ([[$line, $line], [[...$line, 'provenance' => 'bank']], ['item' => $line], []] as $lines) {
            $this->postJson($this->path($work), $this->payload($work, ['refunds' => $lines]))->assertUnprocessable();
        }
        $this->postJson($this->path($work), $this->payload($work, ['tip_amount' => '1']))->assertUnprocessable();
        $this->assertDatabaseCount('sale_refunds', 0);
    }

    public function test_insufficient_cash_and_closed_session_cannot_return_cash(): void
    {
        $work = $this->work();
        $this->postJson('/api/v1/cash/sessions/'.$work['session']['id'].'/movements', ['idempotency_key' => (string) Str::uuid(), 'revision' => 3, 'type' => 'expense', 'amount' => '1040', 'reason' => 'Retiro de efectivo'])->assertCreated();
        $this->postJson($this->path($work), $this->payload($work, ['cash_revision' => 4]))->assertUnprocessable();
        $this->postJson('/api/v1/cash/sessions/'.$work['session']['id'].'/close', ['idempotency_key' => (string) Str::uuid(), 'revision' => 4, 'counted_amount' => '0'])->assertOk();
        $this->postJson($this->path($work), $this->payload($work, ['cash_revision' => 5]))->assertConflict();
        $this->assertDatabaseCount('sale_refunds', 0);
    }

    public function test_foreign_sale_payment_and_unprivileged_actor_cannot_refund(): void
    {
        $first = $this->work();
        $second = $this->work('other-refund@example.test');
        $this->postJson($this->path($first), $this->payload($first))->assertNotFound();
        $this->postJson($this->path($second), $this->payload($second, ['refunds' => [['payment_id' => $first['sale']['payments'][0]['id'], 'amount' => '1']]]))->assertNotFound();
        $role = DB::table('roles')->where('tenant_id', $second['owner']->tenant_id)->where('name', 'Cajero')->first();
        $this->actingAs(User::factory()->create(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id]));
        $this->postJson($this->path($second), $this->payload($second))->assertForbidden();
        $this->assertDatabaseCount('sale_refunds', 0);
    }

    public function test_audit_failure_rolls_back_all_refunds_cash_revisions_and_idempotency_record(): void
    {
        $work = $this->work();
        $records = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'sale.partially_refunded') {
                throw new \RuntimeException('Auditoría de devolución fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson($this->path($work), $this->payload($work));
            $this->fail('Auditoría y devolución deben confirmar juntas.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de devolución fallida', $error->getMessage());
        }
        $this->assertDatabaseCount('sale_refunds', 0);
        $this->assertDatabaseCount('cash_movements', 1);
        $this->assertDatabaseCount('idempotency_records', $records);
        $this->getJson('/api/v1/sales/'.$work['sale']['id'])->assertJsonPath('data.revision', 3)->assertJsonPath('data.status', 'paid');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1040.0000')->assertJsonPath('data.revision', 3);
    }

    public function test_partial_refund_history_remains_append_only(): void
    {
        $work = $this->work();
        $this->postJson($this->path($work), $this->payload($work))->assertOk();
        app(TenantContext::class)->run($work['owner']->tenant_id, function () {
            $this->expectException(\LogicException::class);
            SaleRefund::firstOrFail()->update(['amount' => '1']);
        });
    }

    public function test_another_sale_payment_in_same_tenant_is_rejected_and_audit_is_unchanged(): void
    {
        $work = $this->work();
        $order = $this->postJson('/api/v1/orders', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $work['branch'], 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $work['product'], 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.01']]])->assertCreated()->json('data');
        $other = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 3, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '100.01', 'received_amount' => '100.01'])->assertCreated()->json('data');
        $records = DB::table('audit_logs')->count();
        $this->postJson($this->path($work), $this->payload($work, ['cash_revision' => 4, 'refunds' => [['payment_id' => $work['sale']['payments'][0]['id'], 'amount' => '1'], ['payment_id' => $other['payments'][0]['id'], 'amount' => '1']]]))->assertNotFound();
        $this->assertDatabaseCount('sale_refunds', 0);
        $this->assertDatabaseCount('audit_logs', $records);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.revision', 4)->assertJsonPath('data.expected_amount', '1140.0100');
    }

    public function test_archived_non_cash_method_uses_history_and_full_close_needs_no_second_reference(): void
    {
        $work = $this->work();
        $this->putJson('/api/v1/payment-methods/'.$work['transfer']['id'], ['revision' => 1, 'name' => 'Archivada', 'is_active' => false])->assertOk();
        $this->postJson($this->path($work), $this->payload($work, ['refunds' => [['payment_id' => $work['sale']['payments'][1]['id'], 'amount' => '60.01', 'reference' => 'ARCHIVED-REFUND']]]))->assertOk()->assertJsonPath('data.payments.1.method_name', 'Transferencia manual');
        $this->postJson('/api/v1/sales/'.$work['sale']['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 4, 'sale_revision' => 4, 'reason' => 'Cerrar con efectivo restante'])->assertOk()->assertJsonPath('data.status', 'refunded')->assertJsonPath('data.refunded_amount', '100.0100');
        $this->assertDatabaseCount('sale_refunds', 2);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }
}
