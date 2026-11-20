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

class DiningOccupancyTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private array $room;

    private array $tables = [];

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->owner = $this->company('occupancy@example.test');
        $this->actingAs($this->owner);
        $this->branch = app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $this->room = $this->postJson('/api/v1/dining-rooms', [...$this->key(), 'branch_id' => $this->branch, 'name' => 'Interior', 'color' => '#FFFFFF', 'is_active' => true])->assertCreated()->json('data');
        for ($n = 1; $n <= 3; $n++) {
            $this->tables[] = $this->postJson('/api/v1/dining-rooms/'.$this->room['id'].'/tables', [...$this->key(), 'room_revision' => $n, 'name' => 'Mesa '.$n, 'shape' => 'circle', 'capacity' => 4, 'color' => '#DCD6FF', 'is_active' => true])->assertCreated()->json('data');
        }
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function payload(array $indices = [0], array $changes = []): array
    {
        return [...$this->key(), 'branch_id' => $this->branch, 'guest_count' => 2, 'waiter_id' => $this->owner->id, 'notes' => 'Cumpleaños', 'tables' => array_map(fn ($i) => ['id' => $this->tables[$i]['id'], 'revision' => $this->tables[$i]['revision']], $indices), ...$changes];
    }

    private function open(array $indices = [0], array $changes = []): array
    {
        return $this->postJson('/api/v1/dining-sessions', $this->payload($indices, $changes))->assertCreated()->json('data');
    }

    private function detail(int $id): array
    {
        return $this->getJson('/api/v1/dining-sessions/'.$id)->assertOk()->json('data');
    }

    private function close(array $s): array
    {
        return [...$this->key(), 'revision' => $s['revision']];
    }

    private function orderInput(array $s): array
    {
        $p = app(TenantContext::class)->run($this->owner->tenant_id, function () {
            $c = Category::create(['name' => 'Carta', 'color' => '#8271FF']);

            return Product::create(['name' => 'Menú', 'sku' => 'P'.Str::random(6), 'category_id' => $c->id, 'sale_price' => '10.1250', 'is_active' => true, 'is_available' => true]);
        });

        return [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'dine_in', 'currency' => 'COP', 'dining_session_id' => $s['id'], 'dining_session_revision' => $s['revision'], 'items' => [['product_id' => $p->id, 'quantity' => 2, 'product_revision' => 1, 'expected_unit_price' => '10.1250']]];
    }

    public function test_table_orders_only_returns_own_attention_items_and_requires_permissions(): void
    {
        $a = $this->open([0]);
        $b = $this->open([1]);
        $input = $this->orderInput($a);
        $first = $this->postJson('/api/v1/orders', $input)->assertCreated()->json('data.id');
        $second = $this->postJson('/api/v1/orders', [...$input, ...$this->key(), 'dining_session_id' => $b['id'], 'dining_session_revision' => $b['revision']])->assertCreated()->json('data.id');
        $url = '/api/v1/dining-sessions/'.$a['id'].'/orders';
        $this->getJson($url)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $first)->assertJsonPath('data.0.items.0.product_name', 'Menú')->assertJsonPath('data.0.subtotal', '20.2500');
        $this->getJson('/api/v1/dining-sessions/'.$b['id'].'/orders')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $second);
        $this->getJson($url.'?per_page=31')->assertUnprocessable();
        $other = $this->company('table-orders-other@example.test');
        $this->actingAs($other)->getJson($url)->assertNotFound();
        $this->actingAs($this->owner);
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'orders.view')->value('id'))->delete();
        $this->owner->unsetRelation('role');
        $this->getJson($url)->assertForbidden();
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_table_append_keeps_one_order_snapshots_decimal_totals_and_exact_replay(): void
    {
        $session = $this->open();
        $input = $this->orderInput($session);
        $order = $this->postJson('/api/v1/orders', $input)->assertCreated()->json('data');
        $session = $this->detail($session['id']);
        $append = [...$input, ...$this->key(), 'dining_session_revision' => $session['revision'], 'append_order_id' => $order['id'], 'order_revision' => 1];
        $this->postJson('/api/v1/orders', $append)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.revision', 2)->assertJsonPath('data.subtotal', '40.5000')->assertJsonCount(2, 'data.items')->assertJsonPath('data.items.0.id', $order['items'][0]['id'])->assertJsonPath('data.items.0.unit_price', '10.1250');
        $this->postJson('/api/v1/orders', $append)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonCount(2, 'data.items');
        $this->assertDatabaseCount('orders', 1);
        $session = $this->detail($session['id']);
        $this->postJson('/api/v1/orders', [...$append, ...$this->key(), 'dining_session_revision' => $session['revision']])->assertConflict();
        $other = $this->open([1]);
        $this->postJson('/api/v1/orders', [...$append, ...$this->key(), 'dining_session_id' => $other['id'], 'dining_session_revision' => $other['revision'], 'order_revision' => 2])->assertConflict();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'orders.manage')->value('id'))->delete();
        $this->owner->unsetRelation('role');
        $this->postJson('/api/v1/orders', $append)->assertForbidden();
        $this->assertDatabaseCount('order_items', 2);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_table_append_cannot_change_a_collected_order_or_its_cash(): void
    {
        $session = $this->open();
        $input = $this->orderInput($session);
        $order = $this->postJson('/api/v1/orders', $input)->assertCreated()->json('data');
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $cash = $this->postJson('/api/v1/cash/registers/'.$register.'/open', [...$this->key(), 'opening_amount' => '100', 'currency' => 'COP'])->assertCreated()->json('data');
        $this->postJson('/api/v1/orders/'.$order['id'].'/collect', [...$this->key(), 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '20.25', 'received_amount' => '20.25'])->assertCreated();
        $session = $this->detail($session['id']);
        $revision = $this->getJson('/api/v1/orders/'.$order['id'])->json('data.revision');
        $this->postJson('/api/v1/orders', [...$input, ...$this->key(), 'dining_session_revision' => $session['revision'], 'append_order_id' => $order['id'], 'order_revision' => $revision])->assertConflict();
        $this->assertDatabaseCount('order_items', 1);
        $this->assertDatabaseHas('sales', ['order_id' => $order['id'], 'total' => '20.2500']);
        $this->assertDatabaseHas('cash_sessions', ['id' => $cash['id'], 'expected_amount' => '120.2500']);
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_table_append_audit_failure_rolls_back_new_items_total_and_revisions(): void
    {
        $session = $this->open();
        $input = $this->orderInput($session);
        $order = $this->postJson('/api/v1/orders', $input)->assertCreated()->json('data');
        $session = $this->detail($session['id']);
        $append = [...$input, ...$this->key(), 'dining_session_revision' => $session['revision'], 'append_order_id' => $order['id'], 'order_revision' => 1];
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'order.items_added') {
                throw new \RuntimeException('audit unavailable');
            }
        });
        $this->postJson('/api/v1/orders', $append)->assertStatus(500);
        $this->assertDatabaseCount('order_items', 1);
        $this->assertDatabaseHas('orders', ['id' => $order['id'], 'revision' => 1, 'subtotal' => '20.2500']);
        $this->assertDatabaseHas('dining_sessions', ['id' => $session['id'], 'revision' => $session['revision']]);
        $this->assertDatabaseMissing('idempotency_records', ['key' => $append['idempotency_key']]);
    }

    public function test_occupancy_join_separate_waiter_history_close_and_exact_replay(): void
    {
        $input = $this->payload();
        $s = $this->postJson('/api/v1/dining-sessions', $input)->assertCreated()->assertJsonPath('data.waiter_name', 'Ana')->json('data');
        $this->postJson('/api/v1/dining-sessions', $input)->assertCreated()->assertJsonPath('data.id', $s['id']);
        $this->postJson('/api/v1/dining-sessions', $this->payload())->assertConflict();
        $this->postJson('/api/v1/dining-sessions', [...$input, 'guest_count' => 3])->assertConflict();
        $this->getJson('/api/v1/dining-rooms/'.$this->room['id'].'/occupancy')->assertOk()->assertJsonPath('data.0.session.id', $s['id'])->assertJsonPath('data.1.session', null);
        $d = $this->payload([0, 1], ['revision' => 1, 'guest_count' => 6]);
        unset($d['branch_id']);
        $s = $this->putJson('/api/v1/dining-sessions/'.$s['id'], $d)->assertOk()->assertJsonCount(2, 'data.tables')->json('data');
        $this->putJson('/api/v1/dining-sessions/'.$s['id'], $d)->assertOk()->assertJsonPath('data.revision', 2);
        $d = $this->payload([1], ['revision' => 2, 'guest_count' => 3, 'waiter_id' => null]);
        unset($d['branch_id']);
        $s = $this->putJson('/api/v1/dining-sessions/'.$s['id'], $d)->assertOk()->assertJsonPath('data.waiter_name', null)->json('data');
        $this->getJson('/api/v1/dining-rooms/'.$this->room['id'].'/occupancy')->assertJsonPath('data.0.session', null)->assertJsonPath('data.1.session.id', $s['id']);
        $close = $this->close($s);
        $this->postJson('/api/v1/dining-sessions/'.$s['id'].'/close', $close)->assertOk()->assertJsonPath('data.status', 'closed');
        $this->postJson('/api/v1/dining-sessions/'.$s['id'].'/close', $close)->assertOk();
        $this->open([0, 1]);
        $this->assertDatabaseCount('dining_sessions', 2);
        $this->assertSame(4, DB::table('dining_events')->where('dining_session_id', $s['id'])->count());
        $this->assertSame(2, DB::table('dining_session_tables')->where('dining_session_id', $s['id'])->whereNotNull('released_at')->count());
    }

    public function test_stale_capacity_active_configuration_and_occupied_archives_are_rejected(): void
    {
        $this->postJson('/api/v1/dining-sessions', $this->payload([0], ['guest_count' => 5]))->assertUnprocessable();
        $p = $this->payload();
        $p['tables'][0]['revision'] = 9;
        $this->postJson('/api/v1/dining-sessions', $p)->assertConflict();
        $s = $this->open();
        $this->postJson('/api/v1/dining-sessions/'.$s['id'].'/close', [...$this->key(), 'revision' => 99])->assertConflict();
        $this->putJson('/api/v1/dining-rooms/'.$this->room['id'], [...$this->key(), 'revision' => 4, 'name' => 'Interior', 'color' => '#FFFFFF', 'is_active' => false])->assertConflict();
        $this->putJson('/api/v1/dining-rooms/'.$this->room['id'].'/tables/'.$this->tables[0]['id'], [...$this->key(), 'room_revision' => 4, 'revision' => 1, 'name' => 'Mesa 1', 'shape' => 'circle', 'capacity' => 4, 'color' => '#FFFFFF', 'is_active' => false])->assertConflict();
        $this->getJson('/api/v1/dining/available-tables?branch_id='.$this->branch)->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 2);
        $this->getJson('/api/v1/dining/waiters')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.name', 'Ana')->assertJsonMissingPath('data.0.email');
        $this->assertDatabaseCount('dining_sessions', 1);
    }

    public function test_order_association_transfer_revisions_snapshots_partial_debt_and_cash_integrity(): void
    {
        $a = $this->open();
        $b = $this->open([1]);
        $input = $this->orderInput($a);
        $order = $this->postJson('/api/v1/orders', $input)->assertCreated()->assertJsonPath('data.dining_snapshot.tables.0.name', 'Mesa 1')->json('data');
        $this->postJson('/api/v1/orders', $input)->assertCreated()->assertJsonPath('data.id', $order['id']);
        $a = $this->detail($a['id']);
        $this->postJson('/api/v1/dining-sessions/'.$a['id'].'/close', $this->close($a))->assertConflict();
        $transfer = [...$this->key(), 'order_revision' => 1, 'source_revision' => $a['revision'], 'target_session_id' => $b['id'], 'target_revision' => $b['revision']];
        $order = $this->postJson('/api/v1/orders/'.$order['id'].'/dining-transfer', $transfer)->assertOk()->assertJsonPath('data.dining_session_id', $b['id'])->assertJsonPath('data.revision', 2)->assertJsonPath('data.subtotal', '20.2500')->json('data');
        $this->assertSame($input['dining_session_id'], $order['dining_snapshot']['session_id']);
        $this->postJson('/api/v1/orders/'.$order['id'].'/dining-transfer', $transfer)->assertOk();
        $this->postJson('/api/v1/orders/'.$order['id'].'/dining-transfer', [...$transfer, 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $a = $this->detail($a['id']);
        $this->postJson('/api/v1/dining-sessions/'.$a['id'].'/close', $this->close($a))->assertOk();
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $cash = $this->postJson('/api/v1/cash/registers/'.$register.'/open', [...$this->key(), 'opening_amount' => '100', 'currency' => 'COP'])->assertCreated()->json('data');
        $collect = [...$this->key(), 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '0', 'expected_total' => '20.25', 'payment_amount' => '5', 'received_amount' => '5'];
        $this->postJson('/api/v1/orders/'.$order['id'].'/collect', $collect)->assertConflict();
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', [...$collect, 'order_revision' => 2])->assertCreated()->assertJsonPath('data.total', '20.2500')->assertJsonPath('data.balance_due', '15.2500')->json('data');
        $b = $this->detail($b['id']);
        $this->postJson('/api/v1/dining-sessions/'.$b['id'].'/close', $this->close($b))->assertConflict();
        $c = $this->open([2]);
        $this->postJson('/api/v1/orders/'.$order['id'].'/dining-transfer', [...$this->key(), 'order_revision' => 3, 'source_revision' => $b['revision'], 'target_session_id' => $c['id'], 'target_revision' => $c['revision']])->assertConflict();
        $method = $this->getJson('/api/v1/payment-methods')->json('data.0');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', [...$this->key(), 'cash_session_id' => $cash['id'], 'cash_revision' => 2, 'sale_revision' => $sale['revision'], 'expected_balance' => '15.25', 'payments' => [['payment_method_id' => $method['id'], 'method_revision' => $method['revision'], 'amount' => '15.25', 'received_amount' => '20']]])->assertOk()->assertJsonPath('data.balance_due', '0.0000');
        $b = $this->detail($b['id']);
        $this->postJson('/api/v1/dining-sessions/'.$b['id'].'/close', $this->close($b))->assertOk();
        $this->getJson('/api/v1/cash/sessions/'.$cash['id'])->assertJsonPath('data.expected_amount', '120.2500');
        $this->assertDatabaseCount('sales', 1);
        $this->assertDatabaseCount('payments', 2);
        $this->assertDatabaseCount('cash_movements', 2);
        $this->getJson('/api/v1/sales/'.$sale['id'])->assertOk()->assertJsonPath('data.total', '20.2500');
    }

    public function test_permissions_before_replay_tenant_scopes_and_waiter_authority(): void
    {
        $input = $this->payload();
        $s = $this->postJson('/api/v1/dining-sessions', $input)->assertCreated()->json('data');
        $other = $this->company('other-occupancy@example.test');
        $this->actingAs($this->owner);
        $this->postJson('/api/v1/dining-sessions', $this->payload([1], ['waiter_id' => $other->id]))->assertUnprocessable();
        $this->actingAs($other);
        $this->getJson('/api/v1/dining-sessions/'.$s['id'])->assertNotFound();
        $this->getJson('/api/v1/dining-sessions')->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/dining-sessions', $input)->assertUnprocessable();
        $this->getJson('/api/v1/dining/available-tables?branch_id='.$this->branch)->assertJsonCount(0, 'data');
        $this->actingAs($this->owner);
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'dining.operate')->value('id'))->delete();
        $this->owner->unsetRelation('role');
        $this->postJson('/api/v1/dining-sessions', $input)->assertForbidden();
        $this->postJson('/api/v1/dining-sessions/'.$s['id'].'/close', $this->close($s))->assertForbidden();
        $this->getJson('/api/v1/dining/waiters')->assertForbidden();
        $this->getJson('/api/v1/dining-sessions/'.$s['id'])->assertOk();
    }

    public function test_unique_occupation_and_composite_foreign_keys_enforce_integrity_below_services(): void
    {
        $a = $this->open();
        $b = $this->open([1]);
        $member = (array) DB::table('dining_session_tables')->where('dining_session_id', $a['id'])->first();
        unset($member['id'],$member['occupied_table']);
        $other = $this->company('fk-occupancy@example.test');
        foreach ([fn () => DB::table('dining_session_tables')->insert([...$member, 'dining_session_id' => $b['id']]),
            fn () => DB::table('dining_sessions')->where('id', $a['id'])->update(['waiter_id' => $other->id]),
            fn () => DB::table('dining_session_tables')->where('dining_session_id', $a['id'])->update(['tenant_id' => $other->tenant_id])] as $write) {
            try {
                DB::transaction($write);
                $this->fail('Invalid occupation or identity accepted.');
            } catch (QueryException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_audit_failure_rolls_back_occupation_order_and_transfer_without_partial_history(): void
    {
        $a = $this->open();
        $b = $this->open([1]);
        $input = $this->orderInput($a);
        $failOrder = true;
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) use (&$failOrder) {
            if ($failOrder && $log->action === 'dining.session.order.added') {
                throw new \RuntimeException('audit down');
            }
        });
        $this->postJson('/api/v1/orders', $input)->assertStatus(500);
        $this->assertDatabaseCount('orders', 0);
        $this->assertSame($a['revision'], $this->detail($a['id'])['revision']);
        $this->assertDatabaseMissing('idempotency_records', ['key' => $input['idempotency_key']]);
        $failOrder = false;
        $order = $this->postJson('/api/v1/orders', $input)->assertCreated()->json('data');
        $a = $this->detail($a['id']);
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'dining.session.order.transferred') {
                throw new \RuntimeException('audit down');
            }
        });
        $this->postJson('/api/v1/orders/'.$order['id'].'/dining-transfer', [...$this->key(), 'order_revision' => 1, 'source_revision' => $a['revision'], 'target_session_id' => $b['id'], 'target_revision' => $b['revision']])->assertStatus(500);
        $this->assertDatabaseHas('orders', ['id' => $order['id'], 'dining_session_id' => $a['id'], 'revision' => 1]);
        $this->assertSame($b['revision'], $this->detail($b['id'])['revision']);
    }

    public function test_order_requires_correct_channel_company_branch_and_session_revision(): void
    {
        $a = $this->open();
        $input = $this->orderInput($a);
        $this->postJson('/api/v1/orders', [...$input, 'channel' => 'takeaway'])->assertUnprocessable();
        $this->postJson('/api/v1/orders', [...$input, 'dining_session_revision' => 999])->assertConflict();
        $branch = $this->postJson('/api/v1/branches', ['name' => 'Otra', 'code' => 'OTRA', 'is_active' => true])->assertCreated()->json('id');
        $this->postJson('/api/v1/orders', [...$input, 'branch_id' => $branch])->assertConflict();
        $other = $this->company('order-dining-other@example.test');
        $this->actingAs($other);
        $this->postJson('/api/v1/orders', $input)->assertUnprocessable();
        $this->actingAs($this->owner);
        $order = $this->postJson('/api/v1/orders', $input)->assertCreated()->json('data');
        try {
            DB::transaction(fn () => DB::table('orders')->where('id', $order['id'])->update(['branch_id' => $branch]));
            $this->fail('Order accepted a dining session from another branch.');
        } catch (QueryException) {
            $this->assertTrue(true);
        }
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'dining.operate')->value('id'))->delete();
        $this->owner->unsetRelation('role');
        $this->postJson('/api/v1/orders', $input)->assertForbidden();
        $this->assertDatabaseCount('orders', 1);
    }

    public function test_recorded_order_replay_survives_cancelled_order_and_closed_session(): void
    {
        $s = $this->open();
        $input = $this->orderInput($s);
        $order = $this->postJson('/api/v1/orders', $input)->assertCreated()->json('data');
        $this->postJson('/api/v1/orders/'.$order['id'].'/status', [...$this->key(), 'revision' => 1, 'status' => 'cancelled', 'reason' => 'Cliente se retiró'])->assertOk();
        $s = $this->detail($s['id']);
        $this->postJson('/api/v1/dining-sessions/'.$s['id'].'/close', $this->close($s))->assertOk();
        $this->postJson('/api/v1/orders', $input)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.status', 'cancelled');
        $this->postJson('/api/v1/orders', [...$input, ...$this->key()])->assertConflict();
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('sales', 0);
    }
}
