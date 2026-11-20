<?php

namespace App\Domains\Orders;

use App\Domains\Dining\DiningOccupancy;
use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

final class CreateOrder
{
    public function execute(User $actor, array $data): Order
    {
        Gate::authorize('orders.manage');
        Gate::authorize('catalog.view');
        if ($data['dining_session_id'] ?? null) {
            Gate::authorize('dining.operate');
        }
        if ($data['append_order_id'] ?? null) {
            Gate::authorize('orders.view');
        }

        return app(IdempotentOperation::class)->run($actor, 'order.create', $data, Order::class, function ($data) use ($actor) {
            $occupancy = app(DiningOccupancy::class);
            $dining = $occupancy->forOrder($actor, $data);
            $plan = app(OrderPlan::class)->build($actor, $data);
            $appending = ! empty($data['append_order_id']);
            if ($appending) {
                $order = Order::whereKey($data['append_order_id'])->lockForUpdate()->firstOrFail();
                abort_unless($dining && $order->dining_session_id === $dining->id && $order->branch_id === $dining->branch_id && $order->currency === $data['currency'] && $order->channel === 'dine_in', 409, 'El pedido no corresponde a esta atención.');
                abort_unless($order->revision === (int) $data['order_revision'], 409, 'El pedido cambió. Actualiza la mesa antes de agregar productos.');
                abort_if($order->status === 'cancelled' || $order->sale()->exists(), 409, 'Un pedido cancelado o con cobros no admite nuevos productos.');
                abort_if($order->items()->count() + count($plan['items']) > 100, 422, 'El pedido no admite más de 100 posiciones facturables.');
                $previousStatus = $order->status;
                $order->subtotal = Money::bounded(bcadd($order->subtotal, $plan['subtotal'], 4));
                $order->revision++;
                if (in_array($order->status, ['ready', 'delivered'], true)) {
                    $order->status = 'preparing';
                }
                $order->save();
            } else {
                $order = Order::create(['public_id' => (string) Str::uuid(), 'branch_id' => $plan['branch']->id, 'created_by' => $actor->id, 'currency' => $data['currency'], 'channel' => $data['channel'], 'reference' => $data['reference'] ?? null, 'customer_name' => $data['customer_name'] ?? null, 'notes' => $data['notes'] ?? null, 'subtotal' => $plan['subtotal'], 'status' => 'open', 'revision' => 1]);
                $previousStatus = null;
            }
            $combos = [];
            if (! $appending && $order->channel === 'delivery') {
                app(DeliveryWorkflow::class)->create($actor, $order, $data['delivery']);
            }
            if ($dining && ! $appending) {
                $order->dining_session_id = $dining->id;
                $order->dining_snapshot = $occupancy->snapshot($dining);
                $order->save();
            }
            if ($dining) {
                $occupancy->recordOrder($actor, $dining, $order, $appending);
            }
            foreach ($plan['combos'] as $header) {
                $combos[] = $order->combos()->create($header)->id;
            }
            foreach ($plan['items'] as $item) {
                if (array_key_exists('_combo_index', $item)) {
                    $item['order_combo_id'] = $combos[$item['_combo_index']];
                    unset($item['_combo_index']);
                }
                $order->items()->create($item);
            }
            OrderEvent::create(['order_id' => $order->id, 'actor_id' => $actor->id, 'from_status' => $previousStatus, 'to_status' => $order->status, 'reason' => $appending ? 'Se agregaron productos al pedido.' : null, 'created_at' => now()]);
            Audit::record($appending ? 'order.items_added' : 'order.created', $appending ? 'Se agregaron productos al pedido existente, sin cobro.' : 'Se registró un pedido sin cobro.', $actor, ['order_id' => $order->id, 'revision' => $order->revision]);

            return $order;
        });
    }
}
