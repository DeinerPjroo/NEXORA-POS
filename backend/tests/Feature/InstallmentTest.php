<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class InstallmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'abonos@example.test'): array
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
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '0', 'currency' => 'COP'])->assertCreated()->json('data');
        $cash = $this->getJson('/api/v1/payment-methods')->json('data.0');
        $transfer = $this->postJson('/api/v1/payment-methods', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Transferencia manual', 'code' => 'transfer', 'kind' => 'non_cash', 'is_active' => true])->assertCreated()->json('data');

        return compact('owner', 'branch', 'product', 'order', 'session', 'cash', 'transfer');
    }

    private function partial(array $work, array $extra = []): array
    {
        return $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '100.01', 'payment_amount' => '40', 'received_amount' => '50', ...$extra])->assertCreated()->json('data');
    }

    private function payload(array $work, array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2,
            'sale_revision' => 2, 'expected_balance' => '60.01', 'payments' => [
                ['payment_method_id' => $work['cash']['id'], 'method_revision' => 1, 'amount' => '10', 'received_amount' => '20'],
                ['payment_method_id' => $work['transfer']['id'], 'method_revision' => 1, 'amount' => '50.01', 'received_amount' => '50.01', 'reference' => 'REF-001'],
            ], ...$extra];
    }

    public function test_first_installment_preserves_total_and_exposes_exact_outstanding_balance(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        $this->assertSame('partially_paid', $sale['status']);
        $this->assertSame('100.0100', $sale['total']);
        $this->assertSame('40.0000', $sale['paid_amount']);
        $this->assertSame('60.0100', $sale['balance_due']);
        $this->assertSame('10.0000', $sale['payments'][0]['change_amount']);
        $this->assertSame(2, $sale['revision']);
        $this->getJson('/api/v1/sales?status=partially_paid')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '40.0000');
    }

    public function test_mixed_payment_batch_is_atomic_idempotent_and_only_cash_changes_drawer(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        $path = '/api/v1/sales/'.$sale['id'].'/payments';
        $payload = $this->payload($work);
        $this->postJson($path, $payload)->assertOk()->assertJsonPath('data.status', 'paid')->assertJsonPath('data.paid_amount', '100.0100')->assertJsonPath('data.balance_due', '0.0000')->assertJsonCount(3, 'data.payments')->assertJsonPath('data.revision', 3);
        $this->postJson($path, $payload)->assertOk();
        $this->postJson($path, [...$payload, 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $this->assertDatabaseCount('payments', 3);
        $this->assertDatabaseCount('cash_movements', 2);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '50.0000')->assertJsonPath('data.revision', 4);
    }

    public function test_overpayment_zero_stale_revision_and_bad_late_line_do_not_post_any_part(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        $path = '/api/v1/sales/'.$sale['id'].'/payments';
        foreach (['sale_revision' => 5, 'cash_revision' => 5, 'expected_balance' => '1'] as $key => $value) {
            $this->postJson($path, $this->payload($work, [$key => $value]))->assertConflict();
        }
        $payload = $this->payload($work);
        $payload['payments'][1]['amount'] = '60';
        $this->postJson($path, $payload)->assertUnprocessable();
        $payload = $this->payload($work);
        $payload['payments'][0]['amount'] = '0';
        $this->postJson($path, $payload)->assertUnprocessable();
        $payload = $this->payload($work);
        $payload['payments'][1]['reference'] = null;
        $this->postJson($path, $payload)->assertUnprocessable();
        $payload['payments'][1]['provenance'] = 'gateway';
        $this->postJson($path, $payload)->assertUnprocessable();
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 1);
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertJsonPath('data.balance_due', '60.0100')->assertJsonPath('data.revision', 2);
    }

    public function test_full_refund_of_mixed_sale_returns_each_original_payment_once(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->payload($work))->assertOk();
        $payload = ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 4, 'sale_revision' => 3, 'reason' => 'Devolución de todos los pagos', 'refund_reference' => 'REF-DEV-001'];
        $path = '/api/v1/sales/'.$sale['id'].'/refund';
        $this->postJson($path, $payload)->assertOk()->assertJsonPath('data.status', 'refunded')->assertJsonPath('data.refunded_amount', '100.0100')->assertJsonPath('data.cancelled_balance', '0.0000')->assertJsonCount(3, 'data.refunds');
        $this->postJson($path, $payload)->assertOk();
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '0.0000')->assertJsonPath('data.revision', 7);
        $this->assertDatabaseCount('sale_refunds', 3);
        $this->assertDatabaseCount('cash_movements', 4);
    }

    public function test_closing_partial_sale_returns_only_received_money_and_records_cancelled_balance(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        $payload = ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'reason' => 'Cierre de venta con abono'];
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', $payload)->assertOk()->assertJsonPath('data.total', '100.0100')->assertJsonPath('data.refunded_amount', '40.0000')->assertJsonPath('data.cancelled_balance', '60.0100')->assertJsonPath('data.balance_due', '0.0000');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->payload($work))->assertConflict();
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '0.0000');
    }

    public function test_other_tenant_cannot_add_payments_or_reference_foreign_method(): void
    {
        $first = $this->work();
        $sale = $this->partial($first);
        $second = $this->work('other@example.test');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->payload($second))->assertNotFound();
        $otherSale = $this->partial($second);
        $payload = $this->payload($second);
        $payload['payments'][1]['payment_method_id'] = $first['transfer']['id'];
        $this->postJson('/api/v1/sales/'.$otherSale['id'].'/payments', $payload)->assertNotFound();
        $this->getJson('/api/v1/sales/'.$otherSale['id'])->assertJsonPath('data.paid_amount', '40.0000');
    }

    public function test_unauthorized_role_cannot_add_payments(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        $role = DB::table('roles')->where('tenant_id', $work['owner']->tenant_id)->where('name', 'Cajero')->first();
        $this->actingAs(User::factory()->create(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id]));
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->payload($work))->assertForbidden();
    }

    public function test_audit_failure_rolls_back_entire_mixed_batch(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'sale.payments.recorded') {
                throw new \RuntimeException('Fallo de auditoría de pagos');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->payload($work));
            $this->fail('La auditoría debe formar parte de la misma transacción.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Fallo de auditoría de pagos', $error->getMessage());
        }
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 1);
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertJsonPath('data.balance_due', '60.0100')->assertJsonPath('data.revision', 2);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '40.0000');
    }

    public function test_refund_rejects_a_reference_to_a_payment_outside_the_sale_without_any_egress(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $this->payload($work))->assertOk();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 4, 'sale_revision' => 3, 'reason' => 'Referencia incorrecta', 'refund_references' => [['payment_id' => 999999, 'reference' => 'Ajena']]])->assertUnprocessable();
        $this->assertDatabaseCount('sale_refunds', 0);
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertJsonPath('data.status', 'paid');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '50.0000');
    }

    public function test_composite_refund_fk_rejects_a_payment_from_another_sale_of_the_same_tenant(): void
    {
        $work = $this->work();
        $sale = $this->partial($work);
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'reason' => 'Devolución inicial'])->assertOk();
        $order = $this->postJson('/api/v1/orders', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $work['branch'], 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $work['product'], 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.01']]])->assertCreated()->json('data');
        $other = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 3, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '100.01', 'received_amount' => '100.01'])->assertCreated()->json('data');
        $this->expectException(QueryException::class);
        DB::table('sale_refunds')->where('sale_id', $sale['id'])->update(['payment_id' => $other['payments'][0]['id']]);
    }
}
