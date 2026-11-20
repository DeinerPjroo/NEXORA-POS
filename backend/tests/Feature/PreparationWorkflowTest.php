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
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PreparationWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private array $product;

    private array $attention;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('prep@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->branch = $this->scope(fn () => Branch::firstOrFail()->id);
        $room = $this->postJson('/api/v1/dining-rooms', [...$this->key(), 'branch_id' => $this->branch, 'name' => 'Salón', 'color' => '#7258df', 'is_active' => true])->assertCreated()->json('data');
        $table = $this->postJson('/api/v1/dining-rooms/'.$room['id'].'/tables', [...$this->key(), 'room_revision' => 1, 'name' => 'Mesa 1', 'shape' => 'square', 'color' => '#258ca7', 'capacity' => 4, 'is_active' => true])->assertCreated()->json('data');
        $this->attention = $this->postJson('/api/v1/dining-sessions', [...$this->key(), 'branch_id' => $this->branch, 'tables' => [['id' => $table['id'], 'revision' => 1]], 'guest_count' => 2, 'waiter_id' => null])->assertCreated()->json('data');
        $this->product = $this->scope(function () {
            $c = Category::create(['name' => 'Pizzas', 'color' => '#7258df']);
            $p = Product::create(['name' => 'Pizza destino', 'sku' => 'DESTINO', 'category_id' => $c->id, 'sale_price' => '10000', 'is_active' => true, 'is_available' => true]);

            return ['product_id' => $p->id, 'product_revision' => 1, 'quantity' => 1, 'expected_unit_price' => '10000'];
        });
        $station = $this->postJson('/api/v1/kitchen-stations', [...$this->key(), 'branch_id' => $this->branch, 'name' => 'Pizzas', 'color' => '#7258df', 'target_minutes' => 10, 'is_active' => true])->assertCreated()->json('data');
        $this->postJson('/api/v1/kitchen-routes', [...$this->key(), 'branch_id' => $this->branch, 'product_id' => $this->product['product_id'], 'product_revision' => 1, 'kitchen_station_id' => $station['id'], 'is_active' => true])->assertOk();
        $this->product['product_revision'] = 2;
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Preparación', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Chef', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function scope(callable $cb): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $cb);
    }

    private function create(): array
    {
        return $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'dine_in', 'currency' => 'COP', 'dining_session_id' => $this->attention['id'], 'dining_session_revision' => $this->attention['revision'], 'items' => [[...$this->product, 'quantity' => 2, 'preparation_destination' => 'table'], [...$this->product, 'preparation_destination' => 'takeaway']]])->assertCreated()->json('data');
    }

    public function test_mixed_destinations_keep_one_order_and_dispatch_only_additions_with_traceable_corrections(): void
    {
        $order = $this->create();
        $this->assertSame('30000.0000', $order['subtotal']);
        $body = [...$this->key(), 'order_revision' => $order['revision']];
        $path = '/api/v1/orders/'.$order['id'].'/kitchen-dispatch';
        $ticket = $this->postJson($path, $body)->assertCreated()->json('data.tickets.0');
        $this->postJson($path, $body)->assertCreated();
        $this->assertSame(['table', 'takeaway'], array_column($ticket['lines'], 'preparation_destination'));
        $current = $this->getJson('/api/v1/orders/'.$order['id'])->json('data');
        $session = $this->getJson('/api/v1/dining-sessions/'.$this->attention['id'])->json('data');
        $append = $this->postJson('/api/v1/orders', [...$this->key(), 'append_order_id' => $order['id'], 'order_revision' => $current['revision'], 'branch_id' => $this->branch, 'channel' => 'dine_in', 'currency' => 'COP', 'dining_session_id' => $this->attention['id'], 'dining_session_revision' => $session['revision'], 'items' => [[...$this->product, 'preparation_destination' => 'takeaway']]])->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.subtotal', '40000.0000')->json('data');
        $this->postJson($path, [...$this->key(), 'order_revision' => $append['revision']])->assertCreated()->assertJsonCount(1, 'data.tickets.0.lines');
        $current = $this->getJson('/api/v1/orders/'.$order['id'])->json('data');
        $correction = [...$this->key(), 'order_revision' => $current['revision'], 'item_ids' => [$order['items'][0]['id']], 'destination' => 'takeaway', 'reason' => 'Cliente solicita empacar'];
        $url = '/api/v1/orders/'.$order['id'].'/preparation-corrections';
        $this->postJson($url, $correction)->assertOk()->assertJsonPath('data.items.0.preparation_destination', 'takeaway')->assertJsonPath('data.subtotal', '40000.0000');
        $this->postJson($url, $correction)->assertOk();
        $this->postJson($url, [...$correction, ...$this->key()])->assertConflict();
        $this->postJson('/api/v1/kitchen-tickets/'.$ticket['id'].'/status', [...$this->key(), 'revision' => $ticket['revision'], 'status' => 'preparing'])->assertConflict();
        $this->getJson('/api/v1/dining-sessions/'.$this->attention['id'].'/kitchen-tickets')->assertOk()->assertJsonCount(2, 'data');
        $this->scope(function () use ($order) {
            $this->assertSame('table', OrderItem::findOrFail($order['items'][0]['id'])->preparation_destination);
            $this->assertSame('table', KitchenTicketLine::firstOrFail()->snapshot['preparation_destination']);
        });
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('preparation_corrections', 1);
        $this->assertDatabaseCount('kitchen_ticket_lines', 3);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_destination_validation_isolation_permissions_and_audit_rollback(): void
    {
        $order = $this->create();
        $url = '/api/v1/orders/'.$order['id'].'/preparation-corrections';
        $body = [...$this->key(), 'order_revision' => $order['revision'], 'item_ids' => [$order['items'][0]['id']], 'destination' => 'takeaway', 'reason' => 'Empacar pedido'];
        $this->postJson($url, [...$body, 'item_ids' => [999999]])->assertNotFound();
        $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [[...$this->product, 'preparation_destination' => 'table']]])->assertUnprocessable();
        $foreign = $this->company('foreign-prep@example.test');
        $this->actingAs($foreign)->postJson($url, $body)->assertNotFound();
        $this->getJson('/api/v1/dining-sessions/'.$this->attention['id'].'/kitchen-tickets')->assertNotFound();
        $this->actingAs($this->owner);
        AuditLog::creating(function ($log) {
            if ($log->action === 'order.preparation.corrected') {
                throw new \RuntimeException('audit unavailable');
            }
        });
        $this->postJson($url, $body)->assertStatus(500);
        $this->assertDatabaseCount('preparation_corrections', 0);
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.revision', $order['revision'])->assertJsonPath('data.items.0.preparation_destination', 'table');
    }

    public function test_delivery_handoff_closes_only_ready_kitchen_tickets_without_collecting(): void
    {
        $order = $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'delivery', 'currency' => 'COP', 'items' => [[...$this->product, 'preparation_destination' => 'takeaway']], 'delivery' => ['recipient_name' => 'Cliente', 'phone' => '3001234567', 'address' => 'Calle de prueba 123']])->assertCreated()->json('data');
        $ticket = $this->postJson('/api/v1/orders/'.$order['id'].'/kitchen-dispatch', [...$this->key(), 'order_revision' => $order['revision']])->assertCreated()->json('data.tickets.0');
        $this->postJson('/api/v1/kitchen-tickets/'.$ticket['id'].'/status', [...$this->key(), 'revision' => 1, 'status' => 'preparing'])->assertOk();
        $this->postJson('/api/v1/kitchen-tickets/'.$ticket['id'].'/status', [...$this->key(), 'revision' => 2, 'status' => 'ready'])->assertOk();
        $courier = $this->scope(function () {
            return User::factory()->create(['role_id' => Role::where('name', 'Repartidor')->firstOrFail()->id]);
        });
        $delivery = $this->getJson('/api/v1/deliveries?branch_id='.$this->branch)->assertOk()->json('data.0');
        $path = '/api/v1/deliveries/'.$delivery['id'].'/status';
        $this->postJson($path, [...$this->key(), 'revision' => 1, 'status' => 'assigned', 'courier_id' => $courier->id])->assertOk();
        $body = [...$this->key(), 'revision' => 2, 'status' => 'out_for_delivery'];
        $this->postJson($path, $body)->assertOk()->assertJsonPath('data.preparation_status', 'delivered');
        $this->postJson($path, $body)->assertOk();
        $this->scope(function () use ($order) {
            $this->assertSame('delivered', Order::findOrFail($order['id'])->status);
            $this->assertSame(4, KitchenTicket::firstOrFail()->revision);
        });
        $this->assertDatabaseCount('kitchen_ticket_events', 4);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
    }
}
