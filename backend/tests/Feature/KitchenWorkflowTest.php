<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\KitchenTicket;
use App\Models\KitchenTicketLine;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class KitchenWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('chef@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->branch = app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::firstOrFail()->id);
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Kitchen real', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Chef', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function station(string $name = 'Pizzas'): array
    {
        return $this->postJson('/api/v1/kitchen-stations', [...$this->key(), 'branch_id' => $this->branch, 'name' => $name, 'color' => '#7258DF', 'target_minutes' => 12, 'is_active' => true])->assertCreated()->json('data');
    }

    private function product(string $name = 'Pizza'): array
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, function () use ($name) {
            $category = Category::firstOrCreate(['name' => 'Carta'], ['color' => '#7258DF']);
            $p = Product::create(['name' => $name, 'sku' => Str::random(10), 'category_id' => $category->id, 'sale_price' => '20.0000', 'is_active' => true, 'is_available' => true]);

            return ['product_id' => $p->id, 'product_revision' => 1, 'quantity' => 2, 'expected_unit_price' => '20.0000', 'notes' => 'Sin cebolla'];
        });
    }

    private function route(array $item, array $station): array
    {
        $this->postJson('/api/v1/kitchen-routes', [...$this->key(), 'branch_id' => $this->branch, 'product_id' => $item['product_id'], 'product_revision' => $item['product_revision'], 'kitchen_station_id' => $station['id'], 'is_active' => true])->assertOk();
        $item['product_revision']++;

        return $item;
    }

    private function order(array $items, array $extra = []): array
    {
        return $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'takeaway', 'currency' => 'COP', 'reference' => 'Recoger Luis', 'items' => $items, ...$extra])->assertCreated()->json('data');
    }

    private function send(array $order): array
    {
        return $this->postJson('/api/v1/orders/'.$order['id'].'/kitchen-dispatch', [...$this->key(), 'order_revision' => $order['revision']])->assertCreated()->json('data');
    }

    private function state(array $ticket, string $status): array
    {
        return $this->postJson('/api/v1/kitchen-tickets/'.$ticket['id'].'/status', [...$this->key(), 'revision' => $ticket['revision'], 'status' => $status])->assertOk()->json('data');
    }

    public function test_dispatch_groups_stations_snapshots_once_and_never_moves_money(): void
    {
        $a = $this->station();
        $b = $this->station('Bebidas');
        $p = $this->route($this->product(), $a);
        $q = $this->route($this->product('Jugo'), $b);
        $order = $this->order([$p, $q]);
        $input = [...$this->key(), 'order_revision' => $order['revision']];
        $url = '/api/v1/orders/'.$order['id'].'/kitchen-dispatch';
        $first = $this->postJson($url, $input)->assertCreated()->assertJsonCount(2, 'data.tickets')->json('data');
        $this->postJson($url, $input)->assertCreated()->assertJsonPath('data.id', $first['id']);
        $this->postJson($url, [...$input, 'order_revision' => 99])->assertConflict();
        $current = $this->getJson('/api/v1/orders/'.$order['id'])->assertOk()->assertJsonPath('data.status', 'preparing')->assertJsonPath('data.subtotal', '80.0000')->json('data');
        $this->postJson($url, [...$this->key(), 'order_revision' => $current['revision']])->assertConflict();
        $this->assertDatabaseCount('kitchen_ticket_lines', 2);
        $this->assertDatabaseCount('kitchen_tickets', 2);
        $line = $first['tickets'][0]['lines'][0];
        $this->assertSame('Sin cebolla', $line['notes']);
        $this->assertSame(2, $line['quantity']);
        $this->assertArrayNotHasKey('unit_price', $line);
        $this->assertArrayNotHasKey('tax_snapshot', $line);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertDatabaseHas('audit_logs', ['action' => 'kitchen.dispatched']);
    }

    public function test_all_stations_must_finish_before_order_ready_and_delivered(): void
    {
        $p = $this->route($this->product(), $this->station());
        $q = $this->route($this->product('Jugo'), $this->station('Bar'));
        $order = $this->order([$p, $q]);
        $tickets = $this->send($order)['tickets'];
        $this->postJson('/api/v1/orders/'.$order['id'].'/status', [...$this->key(), 'revision' => 2, 'status' => 'ready'])->assertConflict();
        $a = $this->state($tickets[0], 'preparing');
        $this->postJson('/api/v1/kitchen-tickets/'.$a['id'].'/status', [...$this->key(), 'revision' => 1, 'status' => 'ready'])->assertConflict();
        $a = $this->state($a, 'ready');
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.status', 'preparing');
        $b = $this->state($tickets[1], 'preparing');
        $b = $this->state($b, 'ready');
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.status', 'ready');
        $this->state($a, 'delivered');
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.status', 'ready');
        $this->state($b, 'delivered');
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.status', 'delivered');
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch)->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch.'&history=1')->assertJsonCount(2, 'data')->assertJsonStructure(['server_now']);
    }

    public function test_missing_or_archived_route_fails_atomically_and_audit_failure_rolls_back(): void
    {
        $p = $this->product();
        $order = $this->order([$p]);
        $this->postJson('/api/v1/orders/'.$order['id'].'/kitchen-dispatch', [...$this->key(), 'order_revision' => 1])->assertUnprocessable();
        $station = $this->station();
        $this->route($p, $station);
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'kitchen.dispatched') {
                throw new \RuntimeException('audit offline');
            }
        });
        $input = [...$this->key(), 'order_revision' => 1];
        $this->postJson('/api/v1/orders/'.$order['id'].'/kitchen-dispatch', $input)->assertStatus(500);
        $this->assertDatabaseCount('kitchen_dispatches', 0);
        $this->assertDatabaseCount('kitchen_ticket_lines', 0);
        $this->assertDatabaseCount('kitchen_ticket_events', 0);
        $this->assertDatabaseMissing('idempotency_records', ['key' => $input['idempotency_key']]);
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.status', 'open')->assertJsonPath('data.revision', 1);
    }

    public function test_cancel_order_cancels_active_tickets_and_state_replay_is_exact(): void
    {
        $item = $this->route($this->product(), $this->station());
        $order = $this->order([$item]);
        $ticket = $this->send($order)['tickets'][0];
        $input = [...$this->key(), 'revision' => 1, 'status' => 'preparing'];
        $url = '/api/v1/kitchen-tickets/'.$ticket['id'].'/status';
        $this->postJson($url, $input)->assertOk()->assertJsonPath('data.revision', 2);
        $this->postJson($url, $input)->assertOk()->assertJsonPath('data.revision', 2);
        $this->postJson($url, [...$input, 'status' => 'ready'])->assertConflict();
        $current = $this->getJson('/api/v1/orders/'.$order['id'])->json('data');
        $this->postJson('/api/v1/orders/'.$order['id'].'/status', [...$this->key(), 'revision' => $current['revision'], 'status' => 'cancelled', 'reason' => 'Cliente se retiró'])->assertOk();
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch.'&history=1')->assertJsonPath('data.0.status', 'cancelled')->assertJsonPath('data.0.events.2.reason', 'Cliente se retiró');
        $this->postJson($url, [...$this->key(), 'revision' => 3, 'status' => 'ready'])->assertConflict();
    }

    public function test_tenant_permissions_branch_routes_and_composite_constraints(): void
    {
        $station = $this->station();
        $product = $this->product();
        $item = $this->route($product, $station);
        $this->postJson('/api/v1/kitchen-routes', [...$this->key(), 'branch_id' => $this->branch, 'product_id' => $product['product_id'], 'product_revision' => 1, 'kitchen_station_id' => $station['id'], 'is_active' => false])->assertConflict();
        $order = $this->order([$item]);
        $ticket = $this->send($order)['tickets'][0];
        $other = $this->company('other-kitchen@example.test');
        $this->actingAs($other);
        $this->getJson('/api/v1/orders/'.$order['id'].'/kitchen-preview')->assertNotFound();
        $this->postJson('/api/v1/kitchen-tickets/'.$ticket['id'].'/status', [...$this->key(), 'revision' => 1, 'status' => 'preparing'])->assertNotFound();
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch)->assertUnprocessable();
        $this->actingAs($this->owner);
        $keys = ['kitchen.view', 'kitchen.operate'];
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->whereNotIn('permission_id', DB::table('permissions')->whereIn('key', $keys)->pluck('id'))->delete();
        $this->owner->unsetRelation('role');
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch)->assertOk()->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.subtotal');
        $this->state($ticket, 'preparing');
        $this->getJson('/api/v1/orders/'.$order['id'])->assertForbidden();
        $this->postJson('/api/v1/kitchen-routes', [...$this->key(), 'branch_id' => $this->branch, 'product_id' => $item['product_id'], 'product_revision' => 2, 'kitchen_station_id' => $station['id'], 'is_active' => false])->assertForbidden();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->delete();
        $this->owner->unsetRelation('role');
        $this->postJson('/api/v1/kitchen-tickets/'.$ticket['id'].'/status', [...$this->key(), 'revision' => 1, 'status' => 'preparing'])->assertForbidden();
    }

    public function test_additions_dispatch_only_new_lines_and_unsent_lines_keep_preparing(): void
    {
        $station = $this->station();
        $item = $this->route($this->product(), $station);
        $room = $this->postJson('/api/v1/dining-rooms', [...$this->key(), 'branch_id' => $this->branch, 'name' => 'Sala', 'color' => '#7258DF', 'is_active' => true])->json('data');
        $table = $this->postJson('/api/v1/dining-rooms/'.$room['id'].'/tables', [...$this->key(), 'room_revision' => 1, 'name' => 'Mesa', 'shape' => 'square', 'capacity' => 4, 'color' => '#7258DF', 'is_active' => true])->json('data');
        $session = $this->postJson('/api/v1/dining-sessions', [...$this->key(), 'branch_id' => $this->branch, 'guest_count' => 2, 'waiter_id' => null, 'tables' => [['id' => $table['id'], 'revision' => 1]]])->assertCreated()->json('data');
        $extra = ['channel' => 'dine_in', 'dining_session_id' => $session['id'], 'dining_session_revision' => $session['revision']];
        $order = $this->order([$item], $extra);
        $ticket = $this->send($order)['tickets'][0];
        $fresh = $this->getJson('/api/v1/orders/'.$order['id'])->json('data');
        $session = $this->getJson('/api/v1/dining-sessions/'.$session['id'])->json('data');
        $appended = $this->order([$item], [...$extra, 'dining_session_revision' => $session['revision'], 'append_order_id' => $order['id'], 'order_revision' => $fresh['revision']]);
        $this->assertSame($order['id'], $appended['id']);
        $ticket = $this->state($ticket, 'preparing');
        $this->state($ticket, 'ready');
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.status', 'preparing')->assertJsonPath('data.subtotal', '80.0000');
        $this->send($appended);
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('kitchen_ticket_lines', 2);
        $this->assertDatabaseCount('kitchen_tickets', 2);
    }

    public function test_archived_station_rejects_new_work_but_keeps_existing_ticket_snapshot(): void
    {
        $station = $this->station();
        $item = $this->route($this->product(), $station);
        $order = $this->order([$item]);
        $ticket = $this->send($order)['tickets'][0];
        $nextOrder = $this->order([$item]);
        $this->putJson('/api/v1/kitchen-stations/'.$station['id'], [...$this->key(), 'revision' => 1, 'name' => 'Pizzas antigua', 'color' => '#FF0000', 'target_minutes' => 30, 'is_active' => false])->assertOk();
        $this->postJson('/api/v1/orders/'.$nextOrder['id'].'/kitchen-dispatch', [...$this->key(), 'order_revision' => 1])->assertUnprocessable();
        $this->state($ticket, 'preparing');
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch)->assertJsonPath('data.0.station_name', 'Pizzas')->assertJsonPath('data.0.target_minutes', 12);
        $this->assertDatabaseCount('kitchen_tickets', 1);
    }

    public function test_database_rejects_cross_branch_ticket_and_duplicate_sent_line(): void
    {
        $item = $this->route($this->product(), $this->station());
        $order = $this->order([$item]);
        $ticket = $this->send($order)['tickets'][0];
        $branch = $this->postJson('/api/v1/branches', ['name' => 'Otra', 'code' => 'OTRA', 'is_active' => true])->assertCreated()->json('id');
        $station = $this->postJson('/api/v1/kitchen-stations', [...$this->key(), 'branch_id' => $branch, 'name' => 'Otra cocina', 'color' => '#7258DF', 'target_minutes' => 15, 'is_active' => true])->assertCreated()->json('data');
        $row = app(TenantContext::class)->run($this->owner->tenant_id, fn () => KitchenTicket::findOrFail($ticket['id'])->getAttributes());
        unset($row['id']);
        $row['branch_id'] = $branch;
        $row['kitchen_station_id'] = $station['id'];
        try {
            DB::transaction(fn () => DB::table('kitchen_tickets')->insert($row));
            $this->fail('Debe conservar la sucursal del pedido.');
        } catch (QueryException) {
            $this->assertTrue(true);
        }
        $line = app(TenantContext::class)->run($this->owner->tenant_id, fn () => KitchenTicketLine::firstOrFail()->getAttributes());
        unset($line['id']);
        try {
            DB::transaction(fn () => DB::table('kitchen_ticket_lines')->insert($line));
            $this->fail('Una línea solo se puede despachar una vez.');
        } catch (QueryException) {
            $this->assertTrue(true);
        }
        $this->assertDatabaseCount('kitchen_tickets', 1);
        $this->assertDatabaseCount('kitchen_ticket_lines', 1);
    }
}
