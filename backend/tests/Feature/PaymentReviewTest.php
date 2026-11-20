<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\PaymentReview;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class PaymentReviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'review@example.test', bool $cash = false): array
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
        $method = $this->postJson('/api/v1/payment-methods', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Transferencia original', 'code' => 'bank', 'kind' => 'non_cash', 'is_active' => true])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '100.01', 'received_amount' => '100.01', ...($cash ? [] : ['payment_method_id' => $method['id'], 'method_revision' => 1, 'payment_reference' => 'BANK-1'])])->assertCreated()->json('data');
        $payment = $sale['payments'][0];

        return compact('owner', 'branch', 'session', 'method', 'sale', 'payment');
    }

    private function path(array $work): string
    {
        return '/api/v1/finance/payments/'.$work['payment']['id'].'/reviews';
    }

    private function payload(array $changes = []): array
    {
        return array_replace(['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 2, 'review_revision' => 0, 'expected_net_amount' => '100.01', 'status' => 'matched', 'observed_amount' => '100.01', 'reference' => 'EXTRACTO-1', 'notes' => null, 'review_confirmed' => true], $changes);
    }

    private function refund(array $work, string $amount = '1'): void
    {
        $this->postJson('/api/v1/sales/'.$work['sale']['id'].'/refunds', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'expected_refundable' => '100.01', 'reason' => 'Compensación tras revisión manual', 'refunds' => [['payment_id' => $work['payment']['id'], 'amount' => $amount, 'reference' => 'DEV-1']]])->assertOk();
    }

    public function test_manual_review_is_idempotent_audited_and_never_changes_financial_records(): void
    {
        $work = $this->work();
        $before = [];
        foreach (['sales', 'payments', 'cash_sessions', 'cash_movements', 'sale_refunds'] as $table) {
            $before[$table] = DB::table($table)->get()->toJson();
        }
        $payload = $this->payload();
        $review = $this->postJson($this->path($work), $payload)->assertCreated()->assertJsonPath('data.version', 1)->assertJsonPath('data.difference_amount', '0.0000')->assertJsonPath('data.provenance', 'operator')->assertJsonPath('data.actor_name', 'Ana')->assertJsonMissingPath('data.tenant_id')->json('data');
        $this->postJson($this->path($work), $payload)->assertCreated()->assertJsonPath('data.id', $review['id']);
        $this->postJson($this->path($work), array_replace($payload, ['reference' => 'OTRA']))->assertConflict();
        $this->postJson($this->path($work), $this->payload())->assertConflict();
        $this->assertDatabaseCount('payment_reviews', 1);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'payment.manually_reviewed')->count());
        foreach ($before as $table => $json) {
            $this->assertSame($json, DB::table($table)->get()->toJson(), $table.' debe conservarse.');
        }
        $this->getJson('/api/v1/finance/payments?review_status=matched')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.review_status', 'matched')->assertJsonPath('data.0.review_revision', 1);
        $this->getJson($this->path($work))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $review['id']);
    }

    public function test_signed_difference_pending_and_latest_state_filters_preserve_older_declarations(): void
    {
        $work = $this->work();
        $this->getJson('/api/v1/finance/payments?review_status=pending')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson($this->path($work), $this->payload(['status' => 'difference', 'observed_amount' => '99.99', 'notes' => 'Faltan dos centavos']))->assertCreated()->assertJsonPath('data.difference_amount', '-0.0200');
        $this->getJson('/api/v1/finance/payments?review_status=difference')->assertJsonCount(1, 'data')->assertJsonPath('data.0.review_status', 'difference');
        $this->postJson($this->path($work), $this->payload(['review_revision' => 1, 'status' => 'pending', 'observed_amount' => null, 'reference' => null, 'notes' => 'Pendiente de nuevo soporte']))->assertCreated()->assertJsonPath('data.version', 2)->assertJsonPath('data.observed_amount', null)->assertJsonPath('data.difference_amount', null);
        $this->getJson('/api/v1/finance/payments?review_status=difference')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/finance/payments?review_status=pending')->assertJsonCount(1, 'data')->assertJsonPath('data.0.latest_review.version', 2);
        $this->postJson($this->path($work), $this->payload(['review_revision' => 2, 'status' => 'difference', 'observed_amount' => '100.03', 'notes' => 'Sobran dos centavos']))->assertCreated()->assertJsonPath('data.difference_amount', '0.0200');
        $this->getJson($this->path($work))->assertJsonCount(3, 'data')->assertJsonPath('data.0.version', 3)->assertJsonPath('data.2.difference_amount', '-0.0200');
        $this->getJson($this->path($work).'?page=2')->assertJsonCount(0, 'data')->assertJsonPath('meta.total', 3);
    }

    public function test_refund_makes_review_stale_and_old_replay_cannot_reconfirm_changed_finances(): void
    {
        $work = $this->work();
        $payload = $this->payload();
        $this->postJson($this->path($work), $payload)->assertCreated();
        $this->refund($work);
        $this->getJson('/api/v1/finance/payments?review_status=stale')->assertJsonCount(1, 'data')->assertJsonPath('data.0.review_status', 'stale')->assertJsonPath('data.0.net_paid_amount', '99.0100');
        $this->getJson('/api/v1/finance/payments?review_status=matched')->assertJsonCount(0, 'data');
        $this->postJson($this->path($work), $payload)->assertCreated()->assertJsonPath('data.expected_net_amount', '100.0100');
        $this->getJson('/api/v1/finance/payments')->assertJsonPath('data.0.review_status', 'stale');
        $this->postJson($this->path($work), $this->payload(['review_revision' => 1]))->assertConflict();
        $this->postJson($this->path($work), $this->payload(['review_revision' => 1, 'sale_revision' => 3, 'expected_net_amount' => '99.01', 'observed_amount' => '99.01']))->assertCreated()->assertJsonPath('data.version', 2);
        $this->getJson('/api/v1/finance/payments?review_status=matched')->assertJsonCount(1, 'data')->assertJsonPath('data.0.review_status', 'matched');
    }

    public function test_fully_returned_archived_method_can_be_manually_reviewed_at_zero_net(): void
    {
        $work = $this->work();
        $this->putJson('/api/v1/payment-methods/'.$work['method']['id'], ['revision' => 1, 'name' => 'Archivada', 'is_active' => false])->assertOk();
        $this->refund($work, '100.01');
        $this->postJson($this->path($work), $this->payload(['sale_revision' => 3, 'expected_net_amount' => '0', 'observed_amount' => '0']))->assertCreated()->assertJsonPath('data.difference_amount', '0.0000');
        $this->getJson('/api/v1/finance/payments')->assertJsonPath('data.0.method_name', 'Transferencia original')->assertJsonPath('data.0.review_status', 'matched');
    }

    public function test_cash_and_inconsistent_or_unconfirmed_declarations_are_rejected(): void
    {
        $cash = $this->work(cash: true);
        $this->postJson($this->path($cash), $this->payload())->assertUnprocessable();
        $this->getJson('/api/v1/finance/payments')->assertJsonPath('data.0.review_status', 'not_applicable');
        $this->getJson('/api/v1/finance/payments?review_status=pending')->assertJsonCount(0, 'data');
        $work = $this->work('invalid-review@example.test');
        foreach ([['review_confirmed' => false], ['status' => 'matched', 'observed_amount' => '99'], ['status' => 'difference', 'notes' => 'Diferencia', 'observed_amount' => '100.01'], ['status' => 'difference', 'observed_amount' => '99'], ['status' => 'pending', 'observed_amount' => '1', 'notes' => 'Pendiente'], ['reference' => ''], ['observed_amount' => '0.001'], ['observed_amount' => '-1'], ['observed_amount' => '1000000000000000'], ['provider_confirmed' => true], ['provenance' => 'bank'], ['tenant_id' => $work['owner']->tenant_id], ['cash_session_id' => $work['session']['id']]] as $changes) {
            $this->postJson($this->path($work), $this->payload($changes))->assertUnprocessable();
        }
        $this->postJson($this->path($work), $this->payload(['sale_revision' => 1]))->assertConflict();
        $this->postJson($this->path($work), $this->payload(['review_revision' => 1]))->assertConflict();
        $this->postJson($this->path($work), $this->payload(['expected_net_amount' => '100']))->assertConflict();
        $this->assertDatabaseCount('payment_reviews', 0);
        $this->getJson('/api/v1/finance/payments?review_status=confirmed')->assertUnprocessable();
    }

    public function test_permission_is_independent_and_checked_even_for_replay_and_foreign_payments(): void
    {
        $first = $this->work();
        $payload = $this->payload();
        $this->postJson($this->path($first), $payload)->assertCreated();
        $second = $this->work('other-review@example.test');
        $this->getJson($this->path($first))->assertNotFound();
        $this->postJson($this->path($first), $this->payload())->assertNotFound();
        $role = DB::table('roles')->where('tenant_id', $second['owner']->tenant_id)->where('name', 'Encargado de inventario')->first();
        $reader = User::factory()->create(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id]);
        DB::table('role_permission')->insert(['tenant_id' => $reader->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'sales.view')->value('id')]);
        $this->actingAs($reader);
        $this->getJson($this->path($second))->assertOk();
        $this->postJson($this->path($second), $this->payload())->assertForbidden();
        $this->actingAs($first['owner']->fresh());
        DB::table('role_permission')->where('role_id', $first['owner']->role_id)->where('permission_id', DB::table('permissions')->where('key', 'sales.reconcile')->value('id'))->delete();
        $this->actingAs($first['owner']->fresh());
        $this->postJson($this->path($first), $payload)->assertForbidden();
    }

    public function test_audit_failure_rolls_back_review_and_idempotency_together(): void
    {
        $work = $this->work();
        $records = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'payment.manually_reviewed') {
                throw new \RuntimeException('Auditoría de revisión fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson($this->path($work), $this->payload());
            $this->fail('La revisión exige auditoría atómica.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de revisión fallida', $error->getMessage());
        }
        $this->assertDatabaseCount('payment_reviews', 0);
        $this->assertDatabaseCount('idempotency_records', $records);
    }

    public function test_maximum_observed_amount_has_exact_signed_decimal_difference(): void
    {
        $work = $this->work();
        $this->postJson($this->path($work), $this->payload(['status' => 'difference', 'observed_amount' => '999999999999999.99', 'notes' => 'Diferencia extrema declarada para probar precisión']))
            ->assertCreated()->assertJsonPath('data.observed_amount', '999999999999999.9900')->assertJsonPath('data.difference_amount', '999999999999899.9800');
    }

    public function test_database_rejects_review_linked_to_another_company_payment(): void
    {
        $first = $this->work();
        $this->postJson($this->path($first), $this->payload())->assertCreated();
        $other = $this->work('payment-fk@example.test');
        $row = (array) DB::table('payment_reviews')->first();
        unset($row['id']);
        $row['version'] = 2;
        $row['payment_id'] = $other['payment']['id'];
        $this->expectException(QueryException::class);
        DB::table('payment_reviews')->insert($row);
    }

    public function test_review_cannot_be_changed_or_deleted_and_foreign_actor_is_rejected_by_database(): void
    {
        $work = $this->work();
        $this->postJson($this->path($work), $this->payload())->assertCreated();
        app(TenantContext::class)->run($work['owner']->tenant_id, function () {
            $review = PaymentReview::firstOrFail();
            foreach (['update', 'delete'] as $action) {
                try {
                    $action === 'update' ? $review->update(['notes' => 'Cambiar']) : $review->delete();
                    $this->fail('El historial es append-only.');
                } catch (\LogicException $error) {
                    $this->assertStringContainsString('histórico', $error->getMessage());
                }
            }
        });
        $other = $this->work('fk-review@example.test');
        $row = (array) DB::table('payment_reviews')->first();
        unset($row['id']);
        $row['version'] = 2;
        $row['actor_id'] = $other['owner']->id;
        $this->expectException(QueryException::class);
        DB::table('payment_reviews')->insert($row);
    }
}
