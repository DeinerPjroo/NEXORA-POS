<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\CourierCollection;
use App\Models\OrderDelivery;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CourierCollectionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private array $order;

    private OrderDelivery $delivery;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = app(RegisterCompany::class)->execute(['company_name' => 'Cobro en reparto', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Operador', 'email' => 'collection@example.test', 'password' => 'SeguraNexora123']);
        [$this->branch, $product, $courier] = $this->scope(function () {
            $category = Category::create(['name' => 'Carta', 'color' => '#7255db']);
            $product = Product::create(['name' => 'Pizza', 'sku' => 'COLLECT', 'category_id' => $category->id, 'sale_price' => '100.01', 'is_active' => true, 'is_available' => true]);
            $courier = User::factory()->create(['role_id' => Role::where('name', 'Repartidor')->firstOrFail()->id, 'all_branches' => true]);

            return [Branch::firstOrFail()->id, $product->id, $courier->id];
        });
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Sin impuesto', 'tax_rate' => '0'])->assertOk();
        $this->order = $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'delivery', 'currency' => 'COP', 'delivery' => ['recipient_name' => 'Ana', 'phone' => '3001234567', 'address' => 'Calle de prueba 123'], 'items' => [['product_id' => $product, 'product_revision' => 1, 'quantity' => 1, 'expected_unit_price' => '100.01']]])->assertCreated()->json('data');
        $this->postJson('/api/v1/orders/'.$this->order['id'].'/status', [...$this->key(), 'revision' => 1, 'status' => 'preparing'])->assertOk();
        $this->postJson('/api/v1/orders/'.$this->order['id'].'/status', [...$this->key(), 'revision' => 2, 'status' => 'ready'])->assertOk();
        $this->delivery = $this->scope(fn () => OrderDelivery::firstOrFail());
        $url = '/api/v1/deliveries/'.$this->delivery->id.'/status';
        $this->postJson($url, [...$this->key(), 'revision' => 1, 'status' => 'assigned', 'courier_id' => $courier])->assertOk();
        $this->postJson($url, [...$this->key(), 'revision' => 2, 'status' => 'out_for_delivery'])->assertOk();
    }

    private function scope(callable $callback): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $callback);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function body(array $changes = []): array
    {
        return [...$this->key(), 'delivery_revision' => 3, 'order_revision' => 3, 'settings_revision' => 2, 'expected_total' => '100.01', 'received_amount' => '110', 'confirmed_received' => true, 'reason' => 'Efectivo recibido por el repartidor', ...$changes];
    }

    private function url(): string
    {
        return '/api/v1/deliveries/'.$this->delivery->id.'/collect-courier';
    }

    private function openCash(): array
    {
        $register = $this->getJson('/api/v1/cash/registers')->assertOk()->json('data.0.id');

        return $this->postJson('/api/v1/cash/registers/'.$register.'/open', [...$this->key(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
    }

    public function test_customer_cash_creates_one_paid_sale_without_box_and_replays_without_double_collection(): void
    {
        $body = $this->body();
        $sale = $this->postJson($this->url(), $body)->assertCreated()->assertJsonPath('data.status', 'paid')->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.payments.0.cash_session_id', null)->assertJsonPath('data.payments.0.change_amount', '9.9900')->assertJsonPath('data.payments.0.custody.pending', '100.0100')->json('data');
        $this->postJson($this->url(), $body)->assertCreated()->assertJsonPath('data.id', $sale['id']);
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('courier_collections', 1);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertDatabaseCount('cash_sessions', 0);
        $this->assertDatabaseCount('courier_cash_accounts', 0);
        $this->getJson('/api/v1/deliveries/collections?branch_id='.$this->branch)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.pending', '100.0100');
    }

    public function test_partial_remittance_moves_only_cash_and_refund_from_box_does_not_erase_custody(): void
    {
        $sale = $this->postJson($this->url(), $this->body())->assertCreated()->json('data');
        $cash = $this->openCash();
        $collection = $this->scope(fn () => CourierCollection::firstOrFail());
        $url = '/api/v1/deliveries/collections/'.$collection->id.'/settle';
        $body = [...$this->key(), 'collection_revision' => 1, 'expected_pending' => '100.01', 'amount' => '30', 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'confirmed_handover' => true, 'reason' => 'Entrega parcial de efectivo'];
        $this->postJson($url, $body)->assertOk();
        $this->postJson($url, $body)->assertOk();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', [...$this->key(), 'sale_revision' => $sale['revision'], 'cash_session_id' => $cash['id'], 'cash_revision' => 2, 'reason' => 'Devolución física desde caja'])->assertOk()->assertJsonPath('data.net_paid_amount', '0.0000');
        $this->getJson('/api/v1/deliveries/collections?branch_id='.$this->branch)->assertOk()->assertJsonPath('data.0.pending', '70.0100');
        $this->postJson($url, [...$body, ...$this->key(), 'collection_revision' => 2, 'expected_pending' => '70.01', 'amount' => '70.01', 'cash_revision' => 3])->assertOk();
        $this->getJson('/api/v1/cash/sessions/'.$cash['id'])->assertOk()->assertJsonPath('data.expected_amount', '1000.0000');
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseCount('courier_settlements', 2);
    }

    public function test_collection_validation_and_audit_failure_roll_back_sale_payment_receipt_and_custody(): void
    {
        $this->postJson($this->url(), $this->body(['confirmed_received' => false]))->assertUnprocessable();
        $this->postJson($this->url(), $this->body(['delivery_revision' => 2]))->assertConflict();
        $this->postJson($this->url(), $this->body(['received_amount' => '100']))->assertUnprocessable();
        $fail = true;
        AuditLog::creating(function ($log) use (&$fail) {
            if ($fail && $log->action === 'courier.collection.recorded') {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $body = $this->body();
        $this->postJson($this->url(), $body)->assertServerError();
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('courier_collections', 0);
        $fail = false;
        $this->postJson($this->url(), $body)->assertCreated()->assertJsonPath('data.receipt_code', 'V-000001');
    }

    public function test_settlement_conflicts_overpayment_and_audit_failure_do_not_touch_cash(): void
    {
        $this->postJson($this->url(), $this->body())->assertCreated();
        $cash = $this->openCash();
        $collection = $this->scope(fn () => CourierCollection::firstOrFail());
        $url = '/api/v1/deliveries/collections/'.$collection->id.'/settle';
        $body = [...$this->key(), 'collection_revision' => 1, 'expected_pending' => '100.01', 'amount' => '30', 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'confirmed_handover' => true, 'reason' => 'Entrega parcial'];
        $this->postJson($url, [...$body, 'amount' => '100.02'])->assertUnprocessable();
        $this->postJson($url, [...$body, 'expected_pending' => '100'])->assertConflict();
        $this->postJson($url, [...$body, 'confirmed_handover' => false])->assertUnprocessable();
        $fail = true;
        AuditLog::creating(function ($log) use (&$fail) {
            if ($fail && $log->action === 'courier.collection.settled') {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $this->postJson($url, $body)->assertServerError();
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertDatabaseCount('courier_settlements', 0);
        $fail = false;
        $this->postJson($url, $body)->assertOk();
        $this->postJson($url, [...$body, ...$this->key()])->assertConflict();
        $this->getJson('/api/v1/cash/sessions/'.$cash['id'])->assertOk()->assertJsonPath('data.expected_amount', '1030.0000');
    }

    public function test_operational_courier_and_foreign_tenant_cannot_collect_or_read_custody(): void
    {
        $courier = $this->scope(fn () => User::findOrFail($this->delivery->fresh()->courier_id));
        $this->actingAs($courier)->postJson($this->url(), $this->body())->assertForbidden();
        $this->getJson('/api/v1/deliveries/collections?branch_id='.$this->branch)->assertForbidden();
        $foreign = app(RegisterCompany::class)->execute(['company_name' => 'Otra', 'business_type' => 'restaurant', 'branch_name' => 'Otra', 'name' => 'Otro', 'email' => 'other-collection@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($foreign)->postJson($this->url(), $this->body())->assertNotFound();
        $this->getJson('/api/v1/deliveries/collections?branch_id='.$this->branch)->assertNotFound();
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_revoked_branch_cannot_replay_collection_or_settlement(): void
    {
        $collectionBody = $this->body();
        $this->postJson($this->url(), $collectionBody)->assertCreated();
        $cash = $this->openCash();
        $collection = $this->scope(fn () => CourierCollection::firstOrFail());
        $url = '/api/v1/deliveries/collections/'.$collection->id.'/settle';
        $body = [...$this->key(), 'collection_revision' => 1, 'expected_pending' => '100.01', 'amount' => '30', 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'confirmed_handover' => true, 'reason' => 'Entrega parcial de efectivo'];
        $this->postJson($url, $body)->assertOk();
        $this->owner->all_branches = false;
        $this->owner->save();
        $this->actingAs($this->owner->fresh());
        $this->postJson($this->url(), $collectionBody)->assertNotFound();
        $this->postJson($url, $body)->assertNotFound();
        $this->getJson('/api/v1/deliveries/collections?branch_id='.$this->branch)->assertNotFound();
        $this->assertDatabaseCount('courier_settlements', 1);
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_courier_refund_reduces_custody_not_cash_and_cannot_be_returned_twice(): void
    {
        $sale = $this->postJson($this->url(), $this->body())->assertCreated()->json('data');
        $collection = $this->scope(fn () => CourierCollection::firstOrFail());
        $url = '/api/v1/deliveries/collections/'.$collection->id.'/refund';
        $body = [...$this->key(), 'sale_revision' => $sale['revision'], 'collection_revision' => 1, 'expected_pending' => '100.01', 'expected_refundable' => '100.01', 'amount' => '40', 'confirmed_handover' => true, 'reason' => 'Devolucion fisica al cliente'];
        $this->postJson($url, [...$body, 'confirmed_handover' => false])->assertUnprocessable();
        $this->postJson($url, $body)->assertOk()->assertJsonPath('data.net_paid_amount', '60.0100')->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.payments.0.custody.pending', '60.0100')->assertJsonPath('data.refunds.0.cash_session_id', null)->assertJsonPath('data.refunds.0.courier_collection_id', $collection->id);
        $this->postJson($url, $body)->assertOk();
        $this->postJson($url, [...$body, ...$this->key()])->assertConflict();
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseCount('cash_movements', 0);
        $cash = $this->openCash();
        $this->postJson('/api/v1/deliveries/collections/'.$collection->id.'/settle', [...$this->key(), 'collection_revision' => 2, 'expected_pending' => '60.01', 'amount' => '60.01', 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'confirmed_handover' => true, 'reason' => 'Rendicion del remanente'])->assertOk();
        $this->postJson($url, [...$body, ...$this->key(), 'sale_revision' => $sale['revision'] + 1, 'collection_revision' => 3, 'expected_pending' => '0', 'expected_refundable' => '60.01', 'amount' => '1'])->assertUnprocessable();
        $this->getJson('/api/v1/cash/sessions/'.$cash['id'])->assertOk()->assertJsonPath('data.expected_amount', '1060.0100');
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_courier_refund_permissions_audit_rollback_and_sale_limit(): void
    {
        $sale = $this->postJson($this->url(), $this->body())->assertCreated()->json('data');
        $collection = $this->scope(fn () => CourierCollection::firstOrFail());
        $url = '/api/v1/deliveries/collections/'.$collection->id.'/refund';
        $body = [...$this->key(), 'sale_revision' => $sale['revision'], 'collection_revision' => 1, 'expected_pending' => '100.01', 'expected_refundable' => '100.01', 'amount' => '100.02', 'confirmed_handover' => true, 'reason' => 'Devolucion fisica al cliente'];
        $this->postJson($url, $body)->assertUnprocessable();
        $body['amount'] = '100.01';
        $foreign = app(RegisterCompany::class)->execute(['company_name' => 'Otra devolucion', 'business_type' => 'restaurant', 'branch_name' => 'Otra', 'name' => 'Otro', 'email' => 'foreign-custody-refund@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($foreign)->postJson($url, $body)->assertNotFound();
        $this->actingAs($this->owner);
        $fail = true;
        AuditLog::creating(function ($log) use (&$fail) {
            if ($fail && $log->action === 'sale.partially_refunded') {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $this->postJson($url, $body)->assertServerError();
        $this->assertDatabaseCount('sale_refunds', 0);
        $fail = false;
        $courier = $this->scope(fn () => User::findOrFail($collection->courier_id));
        $this->actingAs($courier)->postJson($url, $body)->assertForbidden();
        $this->actingAs($this->owner)->postJson($url, $body)->assertOk()->assertJsonPath('data.status', 'refunded')->assertJsonPath('data.payments.0.custody.pending', '0.0000');
        $this->owner->all_branches = false;
        $this->owner->save();
        $this->actingAs($this->owner->fresh())->postJson($url, $body)->assertNotFound();
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_ordinary_checkout_cannot_be_forged_into_courier_custody(): void
    {
        $cash = $this->openCash();
        $body = [...$this->body(), 'discount_amount' => '0', 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'custody_delivery_id' => $this->delivery->id];
        $this->postJson('/api/v1/orders/'.$this->order['id'].'/collect', $body)->assertCreated()->assertJsonPath('data.payments.0.cash_session_id', $cash['id'])->assertJsonPath('data.payments.0.provenance', 'operator');
        $this->assertDatabaseCount('courier_collections', 0);
        $this->assertDatabaseCount('cash_movements', 1);
    }
}
