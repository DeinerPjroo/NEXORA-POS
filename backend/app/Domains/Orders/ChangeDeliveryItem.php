<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Kitchen\KitchenWorkflow;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Models\Order;
use App\Models\OrderDelivery;
use App\Models\OrderEvent;
use App\Models\OrderItemChange;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class ChangeDeliveryItem
{
    public function execute(User $actor, Order $order, array $data): Order
    {
        Gate::authorize('orders.view');
        Gate::authorize('orders.manage');
        Gate::authorize('orders.cancel');

        return app(IdempotentOperation::class)->run($actor, 'order.item.change.'.$order->id, $data, Order::class, function ($data) use ($actor, $order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            abort_unless($order->channel === 'delivery' && $order->revision === (int) $data['order_revision'], 409, 'El pedido cambió. Actualiza antes de corregir.');
            abort_if($order->status === 'cancelled' || $order->sale()->exists(), 409, 'No se modifican productos de pedidos cancelados o con venta registrada.');
            $delivery = OrderDelivery::where('order_id', $order->id)->lockForUpdate()->firstOrFail();
            abort_unless($delivery->revision === (int) $data['delivery_revision'] && in_array($delivery->status, ['pending', 'assigned'], true), 409, 'El domicilio cambió o ya salió a reparto.');
            $item = $order->items()->whereKey($data['item_id'])->with('preparationCorrections')->lockForUpdate()->firstOrFail();
            $correcting = $data['action'] === 'correct';
            abort_if($correcting && $item->order_combo_id, 422, 'Retira el combo completo y agrega la nueva selección desde el menú.');
            abort_if($correcting && (int) $data['quantity'] > $item->quantity, 422, 'Para aumentar cantidades utiliza Añadir productos.');
            abort_if($correcting && (int) $data['quantity'] === $item->quantity && ($data['notes'] ?? null) === $item->notes, 422, 'Cambia la cantidad o las notas.');
            $items = $item->order_combo_id ? $order->items()->where('order_combo_id', $item->order_combo_id)->lockForUpdate()->get() : collect([$item]);
            $from = $order->status;
            foreach ($items as $original) {
                $replacement = null;
                if ($correcting) {
                    $replacement = $original->replicate(['created_at', 'updated_at']);
                    $replacement->quantity = (int) $data['quantity'];
                    $replacement->notes = $data['notes'] ?? null;
                    $replacement->preparation_destination = $original->destination($order->channel);
                    $replacement->line_subtotal = Money::bounded(bcmul($original->unit_price, (string) $replacement->quantity, 4));
                    $replacement->save();
                }
                OrderItemChange::create(['order_id' => $order->id, 'order_item_id' => $original->id, 'replacement_item_id' => $replacement?->id, 'actor_id' => $actor->id, 'reason' => $data['reason'], 'created_at' => now()]);
                app(KitchenWorkflow::class)->changeItem($actor, $order, $original, $replacement, $data['reason']);
            }
            $subtotal = '0.0000';
            foreach ($order->items()->get() as $active) {
                $subtotal = Money::bounded(bcadd($subtotal, $active->line_subtotal, 4));
            }
            $order->subtotal = $subtotal;
            if (! $order->items()->exists()) {
                $order->status = 'cancelled';
                app(DeliveryWorkflow::class)->cancel($actor, $order, $data['reason']);
            } else {
                app(DeliveryWorkflow::class)->recordItemChange($actor, $delivery, $data['reason']);
                if ($correcting && in_array($order->status, ['ready', 'delivered'], true)) {
                    $order->status = 'preparing';
                }
            }
            $order->revision++;
            $order->save();
            app(KitchenWorkflow::class)->synchronize($actor, $order);
            OrderEvent::create(['order_id' => $order->id, 'actor_id' => $actor->id, 'from_status' => $from, 'to_status' => $order->status, 'reason' => mb_substr(($correcting ? 'Corrección: ' : 'Anulación: ').$data['reason'], 0, 300), 'created_at' => now()]);
            Audit::record('order.item.changed', 'Se corrigieron productos conservando líneas originales y tarifa.', $actor, ['order_id' => $order->id, 'item_ids' => $items->pluck('id')->all(), 'action' => $data['action'], 'revision' => $order->revision]);

            return $order;
        });
    }
}
