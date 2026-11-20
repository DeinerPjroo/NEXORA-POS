<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\SqlConcurrencyTestCase;

class FinancialConcurrencyTest extends SqlConcurrencyTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->requireSql();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function work(string $email = 'race@example.test', bool $open = true): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Concurrencia', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        Auth::guard('sanctum')->forgetUser();
        $this->actingAs($owner);
        [$branch, $product] = app(TenantContext::class)->run($owner->tenant_id, function () {
            $category = Category::create(['name' => 'Carta', 'color' => '#8271FF']);
            $product = Product::create(['name' => 'Menú', 'sku' => 'RACE', 'category_id' => $category->id, 'sale_price' => '100.01', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id];
        });
        $order = $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $product, 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.01']]])->assertCreated()->json('data');
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->assertOk()->json('data.0.id');
        $session = $open ? $this->postJson('/api/v1/cash/registers/'.$register.'/open', [...$this->key(), 'opening_amount' => '100', 'currency' => 'COP'])->assertCreated()->json('data') : null;

        return compact('owner', 'branch', 'product', 'order', 'register', 'session');
    }

    private function collect(array $work, ?string $amount = null): array
    {
        return [...$this->key(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 1, 'order_revision' => 1,
            'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '100.01', 'received_amount' => $amount ?? '100.01',
            ...($amount ? ['payment_amount' => $amount] : [])];
    }

    private function job(array $work, string $operation, int $resource, array $data): array
    {
        return ['operation' => $operation, 'actor_id' => $work['owner']->id, 'resource_id' => $resource, 'data' => $data];
    }

    private function oneAccepted(array $results): void
    {
        $accepted = array_column($results, 'accepted');
        sort($accepted);
        $this->assertSame([false, true], $accepted);
        $statuses = array_column($results, 'status');
        sort($statuses);
        $this->assertSame([200, 409], $statuses);
    }

    private function appendWork(): array
    {
        $work = $this->work();
        $room = $this->postJson('/api/v1/dining-rooms', [...$this->key(), 'branch_id' => $work['branch'], 'name' => 'Salón', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('data');
        $table = $this->postJson('/api/v1/dining-rooms/'.$room['id'].'/tables', [...$this->key(), 'room_revision' => 1, 'name' => 'Mesa', 'shape' => 'square', 'capacity' => 4, 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('data');
        $session = $this->postJson('/api/v1/dining-sessions', [...$this->key(), 'branch_id' => $work['branch'], 'tables' => [['id' => $table['id'], 'revision' => 1]], 'guest_count' => 2, 'waiter_id' => null, 'notes' => ''])->assertCreated()->json('data');
        $input = [...$this->key(), 'branch_id' => $work['branch'], 'channel' => 'dine_in', 'currency' => 'COP', 'dining_session_id' => $session['id'], 'dining_session_revision' => 1, 'items' => [['product_id' => $work['product'], 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.01']]];
        $order = $this->postJson('/api/v1/orders', $input)->assertCreated()->json('data');
        $append = [...$input, ...$this->key(), 'dining_session_revision' => 2, 'append_order_id' => $order['id'], 'order_revision' => 1];

        return [$work, $order, $append];
    }

    public function test_table_append_same_uuid_only_adds_products_once(): void
    {
        [$work, $order, $append] = $this->appendWork();
        $job = $this->job($work, 'order.append', $order['id'], $append);
        $results = $this->race([$job, $job]);
        $this->assertSame([true, true], array_column($results, 'accepted'));
        $this->assertSame($order['id'], $results[0]['id']);
        $this->assertSame($order['id'], $results[1]['id']);
        $this->assertSame(2, DB::table('order_items')->where('order_id', $order['id'])->count());
        $this->assertDatabaseHas('orders', ['id' => $order['id'], 'revision' => 2, 'subtotal' => '200.0200']);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_table_append_different_uuids_rejects_stale_concurrent_addition(): void
    {
        [$work, $order, $append] = $this->appendWork();
        $this->oneAccepted($this->race([$this->job($work, 'order.append', $order['id'], $append), $this->job($work, 'order.append', $order['id'], [...$append, ...$this->key()])]));
        $this->assertSame(2, DB::table('order_items')->where('order_id', $order['id'])->count());
        $this->assertDatabaseHas('orders', ['id' => $order['id'], 'revision' => 2, 'subtotal' => '200.0200']);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_table_append_racing_collection_never_changes_a_collected_total(): void
    {
        [$work, $order, $append] = $this->appendWork();
        $results = $this->race([$this->job($work, 'order.append', $order['id'], $append), $this->job($work, 'sale.collect', $order['id'], $this->collect($work))]);
        $this->oneAccepted($results);
        if ($results[0]['accepted']) {
            $this->assertDatabaseCount('sales', 0);
            $this->assertDatabaseHas('orders', ['id' => $order['id'], 'subtotal' => '200.0200']);
            $this->assertDatabaseHas('cash_sessions', ['id' => $work['session']['id'], 'expected_amount' => '100.0000']);
        } else {
            $this->assertDatabaseHas('orders', ['id' => $order['id'], 'subtotal' => '100.0100']);
            $this->assertDatabaseHas('sales', ['order_id' => $order['id'], 'total' => '100.0100']);
            $this->assertDatabaseHas('cash_sessions', ['id' => $work['session']['id'], 'expected_amount' => '200.0100']);
            $this->assertSame(1, DB::table('order_items')->where('order_id', $order['id'])->count());
        }
    }

    public function test_identical_collect_uuid_replays_one_sale_receipt_payment_and_cash_effect(): void
    {
        $work = $this->work();
        $job = $this->job($work, 'sale.collect', $work['order']['id'], $this->collect($work));
        $results = $this->race([$job, $job]);
        $this->assertSame([true, true], array_column($results, 'accepted'));
        $this->assertSame($results[0]['id'], $results[1]['id']);
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('cash_movements', 1);
        $this->assertDatabaseHas('cash_sessions', ['id' => $work['session']['id'], 'expected_amount' => '200.0100', 'revision' => 2]);
        $this->assertSame(2, (int) DB::table('sales_settings')->value('next_receipt_number'));
    }

    public function test_competing_collect_keys_cannot_sell_or_charge_the_same_order_twice(): void
    {
        $work = $this->work();
        $data = $this->collect($work);
        $this->oneAccepted($this->race([$this->job($work, 'sale.collect', $work['order']['id'], $data), $this->job($work, 'sale.collect', $work['order']['id'], [...$data, ...$this->key()])]));
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseHas('cash_sessions', ['expected_amount' => '200.0100']);
    }

    public function test_competing_openings_leave_one_active_session(): void
    {
        $work = $this->work(open: false);
        $data = [...$this->key(), 'opening_amount' => '100', 'currency' => 'COP'];
        $this->oneAccepted($this->race([$this->job($work, 'cash.open', $work['register'], $data), $this->job($work, 'cash.open', $work['register'], [...$data, ...$this->key()])]));
        $this->assertDatabaseCount('cash_sessions', 1);
        $this->assertSame((int) DB::table('cash_sessions')->value('id'), (int) DB::table('cash_registers')->value('active_session_id'));
    }

    public function test_competing_installments_cannot_exceed_the_original_balance(): void
    {
        $work = $this->work();
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->collect($work, '40'))->assertCreated()->json('data');
        $method = $this->getJson('/api/v1/payment-methods')->assertOk()->json('data.0');
        $data = [...$this->key(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'expected_balance' => '60.01',
            'payments' => [['payment_method_id' => $method['id'], 'method_revision' => $method['revision'], 'amount' => '60.01', 'received_amount' => '60.01']]];
        $this->oneAccepted($this->race([$this->job($work, 'sale.payments', $sale['id'], $data), $this->job($work, 'sale.payments', $sale['id'], [...$data, ...$this->key()])]));
        $this->assertDatabaseCount('payments', 2);
        $this->assertDatabaseHas('sales', ['id' => $sale['id'], 'total' => '100.0100', 'status' => 'paid']);
        $this->assertDatabaseHas('cash_sessions', ['expected_amount' => '200.0100', 'revision' => 3]);
    }

    public function test_competing_refunds_cannot_exceed_the_payment_and_do_not_reopen_debt(): void
    {
        $work = $this->work();
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->collect($work))->assertCreated()->json('data');
        $data = [...$this->key(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'expected_refundable' => '100.01',
            'reason' => 'Prueba de concurrencia', 'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '60']]];
        $this->oneAccepted($this->race([$this->job($work, 'sale.refunds', $sale['id'], $data), $this->job($work, 'sale.refunds', $sale['id'], [...$data, ...$this->key()])]));
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseHas('sale_refunds', ['amount' => '60.0000']);
        $this->assertDatabaseHas('cash_sessions', ['expected_amount' => '140.0100', 'revision' => 3]);
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertOk()->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.net_paid_amount', '40.0100');
    }

    public function test_same_uuid_is_isolated_between_companies_and_foreign_resources_remain_unavailable(): void
    {
        $a = $this->work();
        $b = $this->work('other-race@example.test');
        $data = $this->collect($a);
        $results = $this->race([$this->job($a, 'sale.collect', $a['order']['id'], $data), $this->job($b, 'sale.collect', $b['order']['id'], [...$this->collect($b), 'idempotency_key' => $data['idempotency_key']])]);
        $this->assertSame([true, true], array_column($results, 'accepted'));
        $this->assertDatabaseCount('sales', 2);
        $foreign = $this->job($a, 'sale.collect', $b['order']['id'], $data);
        $this->assertSame([404, 404], array_column($this->race([$foreign, $foreign]), 'status'));
        $this->assertDatabaseCount('payments', 2);
        $this->assertSame(2, DB::table('sales')->where('receipt_number', 1)->count());
    }

    public function test_replayed_collect_key_is_denied_after_permissions_are_removed(): void
    {
        $work = $this->work();
        $data = $this->collect($work);
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $data)->assertCreated();
        $role = DB::table('roles')->where('tenant_id', $work['owner']->tenant_id)->where('name', 'Cajero')->value('id');
        $work['owner']->forceFill(['role_id' => $role])->save();
        $job = $this->job($work, 'sale.collect', $work['order']['id'], $data);
        $results = $this->race([$job, $job]);
        $this->assertSame([403, 403], array_column($results, 'status'));
        $this->assertArrayNotHasKey('id', $results[0]);
        $this->assertArrayNotHasKey('id', $results[1]);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseHas('cash_sessions', ['expected_amount' => '200.0100']);
    }

    public function test_refunds_from_different_sales_cannot_overdraw_a_shared_cash_session(): void
    {
        $work = $this->work();
        $sales = [$this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->collect($work))->assertCreated()->json('data')];
        $other = $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $work['branch'], 'channel' => 'takeaway', 'currency' => 'COP',
            'items' => [['product_id' => $work['product'], 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => '100.01']]])->assertCreated()->json('data');
        $sales[] = $this->postJson('/api/v1/orders/'.$other['id'].'/collect', [...$this->collect($work), 'cash_revision' => 2])->assertCreated()->json('data');
        $this->postJson('/api/v1/cash/sessions/'.$work['session']['id'].'/movements', [...$this->key(), 'revision' => 3, 'type' => 'expense', 'amount' => '200.01', 'reason' => 'Egreso de prueba para acotar fondos'])->assertCreated();
        $payloads = array_map(fn ($sale) => [...$this->key(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 4, 'sale_revision' => 2,
            'expected_refundable' => '100.01', 'reason' => 'Devolución concurrente de prueba', 'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '100.01']]], $sales);
        $results = $this->race([$this->job($work, 'sale.refunds', $sales[0]['id'], $payloads[0]), $this->job($work, 'sale.refunds', $sales[1]['id'], $payloads[1])]);
        $this->oneAccepted($results);
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseCount('payments', 2);
        $this->assertDatabaseHas('cash_sessions', ['expected_amount' => '0.0000', 'revision' => 5]);
        $loser = array_search(false, array_column($results, 'accepted'), true);
        $this->postJson('/api/v1/sales/'.$sales[$loser]['id'].'/refunds', [...$payloads[$loser], ...$this->key(), 'cash_revision' => 5])->assertUnprocessable();
        $this->assertDatabaseCount('sale_refunds', 1);
        $this->assertDatabaseHas('cash_sessions', ['expected_amount' => '0.0000']);
    }
}
