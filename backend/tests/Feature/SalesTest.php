<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Sales\SaleTotals;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use LogicException;
use Tests\TestCase;

class SalesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function owner(string $email = 'sales@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function workspace(User $owner, string $price = '123.4567', string $base = '1000'): array
    {
        $this->actingAs($owner);
        $work = app(TenantContext::class)->run($owner->tenant_id, function () use ($price) {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Producto original', 'sku' => 'ORIGINAL', 'category_id' => $category->id, 'sale_price' => $price, 'is_active' => true, 'is_available' => true])->refresh();

            return ['branch' => Branch::first()->id, 'product' => $product];
        });
        $order = $this->postJson('/api/v1/orders', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $work['branch'], 'currency' => 'COP', 'channel' => 'takeaway', 'items' => [['product_id' => $work['product']->id, 'quantity' => 3, 'expected_unit_price' => $work['product']->sale_price, 'product_revision' => 1]]])->assertCreated()->json('data');
        $register = $this->getJson('/api/v1/cash/registers')->assertOk()->json('data.0');
        $session = $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => $base, 'currency' => 'COP'])->assertCreated()->json('data');

        return [...$work, 'order' => $order, 'session' => $session];
    }

    private function configure(array $extra = []): array
    {
        return $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Impuesto de prueba', 'tax_rate' => '0', ...$extra])->assertOk()->json('data');
    }

    private function payment(array $work, array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 1,
            'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '370.37', 'received_amount' => '400', ...$extra];
    }

    private function collect(array $work, array $extra = []): array
    {
        return $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payment($work, $extra))->assertCreated()->json('data');
    }

    public function test_configuration_requires_confirmation_permission_and_revision(): void
    {
        $work = $this->workspace($this->owner());
        $this->getJson('/api/v1/sales/settings')->assertJsonPath('data.configured', false);
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payment($work, ['settings_revision' => 1]))->assertConflict();
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertUnprocessable();
        $this->configure();
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertConflict();
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_server_rounds_discount_then_tax_and_posts_net_cash_with_exact_change(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure(['tax_mode' => 'exclusive', 'tax_rate' => '8.1250']);
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_amount=10.12')->assertOk()->assertJsonPath('data.subtotal', '370.3700')->assertJsonPath('data.taxable_base', '360.2500')->assertJsonPath('data.tax_amount', '29.2700')->assertJsonPath('data.total', '389.5200');
        $sale = $this->collect($work, ['discount_amount' => '10.12', 'discount_reason' => 'Descuento autorizado', 'expected_total' => '389.52']);
        $this->assertSame('389.5200', $sale['total']);
        $this->assertSame('-0.0001', $sale['rounding_adjustment']);
        $this->assertSame('10.4800', $sale['payment']['change_amount']);
        $this->assertSame('V-000001', $sale['receipt_code']);
        $this->assertSame('123.4567', $sale['items'][0]['unit_price']);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1389.5200')->assertJsonPath('data.revision', 2);
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 1);
    }

    public function test_retries_replay_sale_and_a_new_key_cannot_charge_same_order(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure();
        $payload = $this->payment($work);
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $id = $this->postJson($path, $payload)->assertCreated()->json('data.id');
        $this->postJson($path, array_reverse($payload, true))->assertCreated()->assertJsonPath('data.id', $id);
        $this->postJson($path, [...$payload, 'received_amount' => '500'])->assertConflict();
        $this->postJson($path, [...$payload, 'idempotency_key' => (string) Str::uuid(), 'order_revision' => 2, 'cash_revision' => 2])->assertConflict();
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 1);
    }

    public function test_stale_order_settings_cash_and_forged_total_never_leave_partial_sale(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure();
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        foreach (['order_revision' => 5, 'settings_revision' => 5, 'cash_revision' => 5, 'expected_total' => '1'] as $field => $value) {
            $this->postJson($path, $this->payment($work, [$field => $value]))->assertConflict();
        }
        $this->postJson($path, $this->payment($work, ['total' => '1']))->assertUnprocessable();
        $this->postJson($path, $this->payment($work, ['received_amount' => '1']))->assertUnprocessable();
        $this->postJson($path, $this->payment($work, ['discount_amount' => '10']))->assertUnprocessable();
        $this->postJson($path, $this->payment($work, ['discount_amount' => 'invalid', 'discount_reason' => 'Prueba']))->assertUnprocessable();
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000');
        $this->assertSame(1, (int) DB::table('sales_settings')->value('next_receipt_number'));
    }

    public function test_closed_or_different_branch_cash_cannot_collect(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure();
        $this->postJson('/api/v1/branches', ['name' => 'Norte', 'code' => 'NORTE'])->assertCreated();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.1');
        $other = $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '0', 'currency' => 'COP'])->assertCreated()->json('data');
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $this->postJson($path, $this->payment($work, ['cash_session_id' => $other['id']]))->assertConflict();
        $this->postJson('/api/v1/cash/sessions/'.$work['session']['id'].'/close', ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'counted_amount' => '1000'])->assertOk();
        $this->postJson($path, $this->payment($work, ['cash_revision' => 2]))->assertConflict();
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_paid_order_can_prepare_but_cannot_be_cancelled_or_charged_again(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure();
        $sale = $this->collect($work);
        $path = '/api/v1/orders/'.$work['order']['id'];
        $this->getJson($path)->assertJsonPath('data.sale_id', $sale['id'])->assertJsonPath('data.revision', 2)->assertJsonPath('data.sale_status', 'paid');
        $this->postJson($path.'/status', ['idempotency_key' => (string) Str::uuid(), 'revision' => 2, 'status' => 'cancelled', 'reason' => 'No permitido'])->assertConflict();
        $this->postJson($path.'/status', ['idempotency_key' => (string) Str::uuid(), 'revision' => 2, 'status' => 'preparing'])->assertOk();
    }

    public function test_refund_is_compensating_once_and_preserves_payment_receipt_and_snapshots(): void
    {
        $owner = $this->owner();
        $work = $this->workspace($owner);
        $this->configure();
        $sale = $this->collect($work);
        app(TenantContext::class)->run($owner->tenant_id, fn () => $work['product']->update(['name' => 'Otro nombre', 'sale_price' => '500']));
        DB::table('tenants')->where('id', $owner->tenant_id)->update(['name' => 'Nombre nuevo']);
        $payload = ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'reason' => 'Devolución solicitada'];
        $path = '/api/v1/sales/'.$sale['id'].'/refund';
        $this->postJson($path, $payload)->assertOk()->assertJsonPath('data.status', 'refunded')->assertJsonPath('data.refund.amount', '370.3700')->assertJsonPath('data.payment.amount', '370.3700');
        $this->postJson($path, $payload)->assertOk();
        $this->postJson($path, [...$payload, 'idempotency_key' => (string) Str::uuid(), 'cash_revision' => 3])->assertConflict();
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertJsonPath('data.business_name', 'Oliva')->assertJsonPath('data.items.0.product_name', 'Producto original')->assertJsonPath('data.total', '370.3700');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000');
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseCount('cash_movements', 2);
    }

    public function test_refund_can_use_a_later_session_and_requires_enough_cash(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure();
        $sale = $this->collect($work);
        $this->postJson('/api/v1/cash/sessions/'.$work['session']['id'].'/close', ['idempotency_key' => (string) Str::uuid(), 'revision' => 2, 'counted_amount' => '1370.37'])->assertOk();
        $session = $this->postJson('/api/v1/cash/registers/'.$work['session']['cash_register_id'].'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '0', 'currency' => 'COP'])->assertCreated()->json('data');
        $payload = ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'reason' => 'Devolución del cliente'];
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', $payload)->assertUnprocessable();
        $this->assertDatabaseCount('sale_refunds', 0);
        $this->postJson('/api/v1/cash/sessions/'.$session['id'].'/movements', ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'type' => 'income', 'amount' => '500', 'reason' => 'Base adicional'])->assertCreated();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', [...$payload, 'cash_revision' => 2])->assertOk();
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertJsonPath('data.expected_amount', '129.6300');
    }

    public function test_other_company_cannot_access_receipt_order_cash_or_configuration(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure();
        $sale = $this->collect($work);
        $other = $this->workspace($this->owner('other@example.test'));
        $this->configure(['tax_mode' => 'exclusive', 'tax_rate' => '3']);
        $this->getJson('/api/v1/sales')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertNotFound();
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_amount=0')->assertNotFound();
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payment($work))->assertNotFound();
        $this->postJson('/api/v1/orders/'.$other['order']['id'].'/collect', $this->payment($other, ['cash_session_id' => $work['session']['id'], 'expected_total' => '381.48']))->assertNotFound();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $other['session']['id'], 'cash_revision' => 1, 'reason' => 'No permitido'])->assertNotFound();
        $this->getJson('/api/v1/sales/settings')->assertJsonPath('data.tax_rate', '3.0000');
    }

    public function test_collection_discount_refund_and_settings_permissions_are_independent(): void
    {
        $owner = $this->owner();
        $work = $this->workspace($owner);
        $this->configure();
        $role = DB::table('roles')->where('tenant_id', $owner->tenant_id)->where('name', 'Encargado de inventario')->first();
        $user = User::factory()->create(['tenant_id' => $owner->tenant_id, 'role_id' => $role->id]);
        $this->actingAs($user);
        $this->getJson('/api/v1/sales')->assertForbidden();
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payment($work))->assertForbidden();
        DB::table('role_permission')->insert(['tenant_id' => $owner->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'sales.collect')->value('id')]);
        $this->actingAs($user->fresh());
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_amount=1')->assertForbidden();
        $sale = $this->collect($work);
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'reason' => 'No autorizado'])->assertForbidden();
        $this->putJson('/api/v1/sales/settings', ['revision' => 2, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertForbidden();
    }

    public function test_decimal_limits_validation_and_overflow_roll_back_cash_and_receipt_number(): void
    {
        $work = $this->workspace($this->owner(), '123.4567', '999999999999999.0000');
        $this->configure();
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        foreach (['400.001', '1e6', '-1', 400] as $amount) {
            $this->postJson($path, $this->payment($work, ['received_amount' => $amount]))->assertUnprocessable();
        }
        $this->postJson($path, $this->payment($work))->assertUnprocessable();
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertSame(1, (int) DB::table('sales_settings')->value('next_receipt_number'));
        $this->assertSame('1.0100', SaleTotals::round('1.0050'));
        $this->assertSame('1.0000', SaleTotals::round('1.0049'));
    }

    public function test_financial_models_reject_history_updates(): void
    {
        $owner = $this->owner();
        $work = $this->workspace($owner);
        $this->configure();
        $sale = $this->collect($work);
        app(TenantContext::class)->run($owner->tenant_id, function () use ($sale) {
            try {
                Sale::findOrFail($sale['id'])->update(['total' => '1']);
                $this->fail('El total histórico debe ser inmutable.');
            } catch (LogicException) {
                $this->assertTrue(true);
            }
            $this->expectException(LogicException::class);
            Payment::firstOrFail()->delete();
        });
    }

    public function test_composite_foreign_keys_reject_payment_using_cash_from_another_branch(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure();
        $sale = $this->collect($work);
        $this->postJson('/api/v1/branches', ['name' => 'Norte', 'code' => 'NORTE'])->assertCreated();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.1');
        $session = $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '0', 'currency' => 'COP'])->assertCreated()->json('data');
        $this->expectException(QueryException::class);
        DB::table('payments')->where('sale_id', $sale['id'])->update(['cash_session_id' => $session['id']]);
    }

    public function test_audit_failure_rolls_back_payment_cash_order_and_sequence_together(): void
    {
        $work = $this->workspace($this->owner());
        $this->configure();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'sale.paid') {
                throw new \RuntimeException('Fallo de auditoría de prueba');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->payment($work));
            $this->fail('La transacción debe fallar junto con la auditoría.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Fallo de auditoría de prueba', $error->getMessage());
        }
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertDatabaseCount('idempotency_records', 2);
        $this->assertSame(1, (int) DB::table('orders')->value('revision'));
        $this->assertSame(1, (int) DB::table('sales_settings')->value('next_receipt_number'));
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }
}
