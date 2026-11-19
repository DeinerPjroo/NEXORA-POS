<?php

namespace App\Domains\Orders;

use App\Domains\Dining\DiningOccupancy;
use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
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

        return app(IdempotentOperation::class)->run($actor, 'order.create', $data, Order::class, function ($data) use ($actor) {
            $occupancy = app(DiningOccupancy::class);
            $dining = $occupancy->forOrder($actor, $data);
            $plan = app(OrderPlan::class)->build($actor, $data);
            $order = Order::create(['public_id' => (string) Str::uuid(), 'branch_id' => $plan['branch']->id, 'created_by' => $actor->id, 'currency' => $data['currency'], 'channel' => $data['channel'], 'reference' => $data['reference'] ?? null, 'customer_name' => $data['customer_name'] ?? null, 'notes' => $data['notes'] ?? null, 'subtotal' => $plan['subtotal'], 'status' => 'open', 'revision' => 1]);
            $combos = [];
            if ($dining) {
                $order->dining_session_id = $dining->id;
                $order->dining_snapshot = $occupancy->snapshot($dining);
                $order->save();
                $occupancy->recordOrder($actor, $dining, $order);
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
            OrderEvent::create(['order_id' => $order->id, 'actor_id' => $actor->id, 'from_status' => null, 'to_status' => 'open', 'created_at' => now()]);
            Audit::record('order.created', 'Se registró un pedido sin cobro.', $actor, ['order_id' => $order->id]);

            return $order;
        });
    }
}
