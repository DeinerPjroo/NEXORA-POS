<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class ChangeOrderState
{
    public function execute(User $actor, Order $order, array $data): Order
    {
        Gate::authorize($data['status'] === 'cancelled' ? 'orders.cancel' : 'orders.manage');

        return app(IdempotentOperation::class)->run($actor, 'order.state.'.$order->id, $data, Order::class, function ($data) use ($actor, $order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            abort_if($order->revision !== (int) $data['revision'], 409, 'El pedido cambió. Actualiza su estado antes de continuar.');
            abort_if($data['status'] === 'cancelled' && $order->sale()->exists(), 409, 'El pedido tiene una venta registrada. Gestiona la devolución desde su recibo.');
            $next = ['open' => 'preparing', 'preparing' => 'ready', 'ready' => 'delivered'];
            $allowed = $data['status'] === 'cancelled' ? in_array($order->status, ['open', 'preparing', 'ready'], true) : ($next[$order->status] ?? null) === $data['status'];
            abort_unless($allowed, 409, 'No se permite ese cambio de estado.');
            $from = $order->status;
            $order->status = $data['status'];
            $order->revision++;
            $order->save();
            OrderEvent::create(['order_id' => $order->id, 'actor_id' => $actor->id, 'from_status' => $from, 'to_status' => $order->status, 'reason' => $data['reason'] ?? null, 'created_at' => now()]);
            Audit::record('order.status.changed', 'Se actualizó el estado de un pedido.', $actor, ['order_id' => $order->id, 'from' => $from, 'to' => $order->status]);

            return $order;
        });
    }
}
