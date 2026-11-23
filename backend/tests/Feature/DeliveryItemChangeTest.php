<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\OrderDelivery;
use App\Models\OrderItemChange;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DeliveryItemChangeTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private array $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = app(RegisterCompany::class)->execute(['company_name' => 'Correcciones', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'changes@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        [$this->branch, $id] = $this->scope(function () {
            $category = Category::create(['name' => 'Carta', 'color' => '#7255db']);
            $product = Product::create(['name' => 'Pizza', 'category_id' => $category->id, 'sku' => 'CHANGES', 'sale_price' => '10.0050', 'is_active' => true, 'is_available' => true]);

            return [Branch::firstOrFail()->id, $product->id];
        });
        $station = $this->postJson('/api/v1/kitchen-stations', [...$this->key(), 'branch_id' => $this->branch, 'name' => 'Pizzas', 'color' => '#7255db', 'target_minutes' => 10, 'is_active' => true])->assertCreated()->json('data');
        $this->postJson('/api/v1/kitchen-routes', [...$this->key(), 'branch_id' => $this->branch, 'product_id' => $id, 'product_revision' => 1, 'kitchen_station_id' => $station['id'], 'is_active' => true])->assertOk();
        $this->item = ['product_id' => $id, 'product_revision' => 2, 'quantity' => 2, 'expected_unit_price' => '10.0050', 'notes' => 'Original'];
    }

    private function scope(callable $callback): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $callback);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function order(array $extra = []): array
    {
        return $this->postJson('/api/v1/orders', [...$this->key(), 'branch_id' => $this->branch, 'channel' => 'delivery', 'currency' => 'COP', 'delivery' => ['recipient_name' => 'Cliente', 'phone' => '3001234567', 'address' => 'Calle principal 123'], 'items' => [$this->item], ...$extra])->assertCreated()->json('data');
    }

    private function body(array $order, array $extra = []): array
    {
        return [...$this->key(), 'order_revision' => $order['revision'], 'delivery_revision' => $order['delivery_revision'], 'item_id' => $order['items'][0]['id'], 'action' => 'correct', 'quantity' => 1, 'notes' => 'Sin cebolla', 'reason' => 'Cliente corrige su pedido', ...$extra];
    }

    private function change(array $order, array $body)
    {
        return $this->postJson('/api/v1/orders/'.$order['id'].'/item-changes', $body);
    }

    private function send(array $order): array
    {
        $this->postJson('/api/v1/orders/'.$order['id'].'/kitchen-dispatch', [...$this->key(), 'order_revision' => $order['revision']])->assertCreated();

        return $this->getJson('/api/v1/orders/'.$order['id'])->assertOk()->json('data');
    }

    public function test_delivery_item_correction_preserves_snapshots_and_updates_only_affected_kitchen_line(): void
    {
        $order = $this->send($this->order());
        $old = DB::table('order_items')->where('id', $order['items'][0]['id'])->first();
        $ticket = $this->getJson('/api/v1/orders/'.$order['id'].'/kitchen-tickets')->json('data.0');
        foreach (['preparing', 'ready'] as $status) {
            $ticket = $this->postJson('/api/v1/kitchen-tickets/'.$ticket['id'].'/status', [...$this->key(), 'revision' => $ticket['revision'], 'status' => $status])->assertOk()->json('data');
        }
        $order = $this->getJson('/api/v1/orders/'.$order['id'])->json('data');
        $body = $this->body($order);
        $next = $this->change($order, $body)->assertOk()->assertJsonPath('data.subtotal', '10.0050')->assertJsonPath('data.status', 'preparing')->assertJsonCount(1, 'data.items')->assertJsonCount(1, 'data.item_changes')->json('data');
        $this->assertEquals($old, DB::table('order_items')->where('id', $old->id)->first());
        $this->assertSame('Sin cebolla', $next['items'][0]['notes']);
        $this->assertSame($order['items'][0]['price_snapshot'], $next['items'][0]['price_snapshot']);
        $this->change($order, $body)->assertOk()->assertJsonCount(1, 'data.item_changes');
        $this->change($order, [...$body, 'reason' => 'Otra carga'])->assertConflict();
        $this->getJson('/api/v1/orders/'.$order['id'].'/kitchen-tickets')->assertJsonPath('data.0.status', 'preparing')->assertJsonCount(2, 'data.0.lines')->assertJsonPath('data.0.lines.0.item_change.reason', $body['reason'])->assertJsonPath('data.0.lines.1.notes', 'Sin cebolla');
        $this->getJson('/api/v1/orders/'.$order['id'].'/kitchen-preview')->assertJsonCount(0, 'data.lines');
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch)->assertOk()->assertJsonCount(1, 'recent_changes');
        $this->assertDatabaseCount('kitchen_tickets', 1);
        $this->assertDatabaseCount('order_items', 2);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_delivery_item_removal_excludes_cancelled_items_and_last_removal_cancels_delivery(): void
    {
        $order = $this->send($this->order(['items' => [$this->item, [...$this->item, 'quantity' => 1, 'notes' => 'Otra línea']]]));
        $cancel = $this->body($order, ['action' => 'cancel']);
        unset($cancel['quantity'], $cancel['notes']);
        $next = $this->change($order, $cancel)->assertOk()->assertJsonPath('data.subtotal', '10.0050')->assertJsonCount(1, 'data.items')->json('data');
        $this->getJson('/api/v1/orders/'.$order['id'].'/kitchen-tickets')->assertJsonPath('data.0.status', 'new');
        $cancel = $this->body($next, ['action' => 'cancel']);
        unset($cancel['quantity'], $cancel['notes']);
        $this->change($next, $cancel)->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.delivery_status', 'cancelled')->assertJsonPath('data.subtotal', '0.0000')->assertJsonCount(0, 'data.items')->assertJsonCount(2, 'data.item_changes');
        $this->getJson('/api/v1/orders/'.$order['id'].'/kitchen-tickets')->assertJsonPath('data.0.status', 'cancelled');
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch)->assertJsonCount(0, 'data')->assertJsonCount(2, 'recent_changes');
        $this->assertDatabaseCount('order_items', 2);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_delivery_item_changes_reject_stale_context_other_orders_departure_permissions_and_foreign_tenant(): void
    {
        $order = $this->order();
        $other = $this->order();
        $this->change($order, $this->body($order, ['item_id' => $other['items'][0]['id']]))->assertNotFound();
        $this->change($order, $this->body($order, ['order_revision' => 2]))->assertConflict();
        $this->change($order, $this->body($order, ['delivery_revision' => 2]))->assertConflict();
        $this->change($order, $this->body($order, ['quantity' => 3]))->assertUnprocessable();
        $this->scope(fn () => OrderDelivery::where('order_id', $order['id'])->update(['status' => 'out_for_delivery']));
        $this->change($order, $this->body($order))->assertConflict();
        $this->scope(fn () => OrderDelivery::where('order_id', $order['id'])->update(['status' => 'pending']));
        $staff = $this->scope(fn () => User::factory()->create(['role_id' => Role::where('name', 'Cocinero')->firstOrFail()->id]));
        $this->actingAs($staff);
        $this->change($order, $this->body($order))->assertForbidden();
        $this->actingAs($this->owner);
        $body = $this->body($order);
        $this->change($order, $body)->assertOk();
        $this->actingAs($staff);
        $this->change($order, $body)->assertForbidden();
        $foreign = app(RegisterCompany::class)->execute(['company_name' => 'Ajena', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Otro', 'email' => 'foreign-change@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($foreign);
        $this->change($order, $body)->assertNotFound();
        $this->assertDatabaseCount('order_item_changes', 1);
    }

    public function test_delivery_item_changes_and_history_respect_employee_branch_scope(): void
    {
        $order = $this->send($this->order());
        $this->change($order, $this->body($order))->assertOk();
        $branch = $this->postJson('/api/v1/branches', ['name' => 'Otra', 'code' => 'OTHER'])->assertCreated()->json('id');
        $other = $this->order(['branch_id' => $branch]);
        $staff = $this->scope(function () {
            $user = User::factory()->create(['role_id' => $this->owner->role_id, 'all_branches' => false]);
            $user->branches()->attach($this->branch, ['tenant_id' => $user->tenant_id]);

            return $user->refresh();
        });
        $this->actingAs($staff);
        $this->change($other, $this->body($other))->assertNotFound();
        $this->getJson('/api/v1/orders/'.$other['id'])->assertNotFound();
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$branch)->assertOk()->assertJsonCount(0, 'data')->assertJsonCount(0, 'recent_changes');
        $this->getJson('/api/v1/kitchen-tickets?branch_id='.$this->branch)->assertOk()->assertJsonCount(1, 'recent_changes')->assertJsonPath('recent_changes.0.order_id', $order['id']);
        $this->scope(fn () => $this->assertSame(0, OrderItemChange::where('order_id', $other['id'])->count()));
    }

    public function test_delivery_item_audit_failure_rolls_back_lines_tickets_delivery_and_exact_retry(): void
    {
        $order = $this->send($this->order());
        $body = $this->body($order);
        $fail = true;
        AuditLog::creating(function ($log) use (&$fail) {
            if ($fail && $log->action === 'order.item.changed') {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $this->change($order, $body)->assertServerError();
        $this->assertDatabaseCount('order_items', 1);
        $this->assertDatabaseCount('order_item_changes', 0);
        $this->assertDatabaseCount('kitchen_ticket_lines', 1);
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.revision', $order['revision'])->assertJsonPath('data.delivery_revision', 1);
        $this->getJson('/api/v1/orders/'.$order['id'].'/kitchen-tickets')->assertJsonPath('data.0.revision', 1);
        $fail = false;
        $this->change($order, $body)->assertOk();
    }
}
