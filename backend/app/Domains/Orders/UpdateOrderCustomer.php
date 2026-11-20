<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\DeliveryEvent;
use App\Models\Order;
use App\Models\OrderDelivery;
use App\Models\OrderEvent;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class UpdateOrderCustomer
{
    public function execute(User $actor, Order $order, array $data): Order
    {
        Gate::authorize('orders.view');
        Gate::authorize('orders.manage');

        return app(IdempotentOperation::class)->run($actor, 'order.customer.'.$order->id, $data, Order::class, function ($data) use ($actor, $order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            abort_unless($order->revision === (int) $data['revision'], 409, 'El pedido cambió. Cierra y vuelve a abrir sus datos.');
            abort_if(in_array($order->status, ['cancelled', 'delivered'], true) || $order->sale()->exists(), 409, 'Solo se modifican datos de pedidos en curso sin venta registrada.');
            if ($order->channel === 'delivery') {
                $delivery = OrderDelivery::where('order_id', $order->id)->lockForUpdate()->firstOrFail();
                abort_unless(isset($data['delivery']) && $delivery->revision === (int) $data['delivery']['revision'], 409, 'Los datos de entrega cambiaron. Cierra y vuelve a abrir sus datos.');
                abort_unless(in_array($delivery->status, ['pending', 'assigned'], true), 409, 'No se cambian destinatarios ni dirección cuando el domicilio ya salió.');
                $delivery->fill(collect($data['delivery'])->only('recipient_name', 'phone', 'address', 'instructions')->all());
                $delivery->revision++;
                $delivery->save();
                DeliveryEvent::create(['order_id' => $order->id, 'order_delivery_id' => $delivery->id, 'actor_id' => $actor->id, 'courier_id' => $delivery->courier_id, 'status' => $delivery->status, 'reason' => 'Datos de destinatario actualizados: '.$data['reason'], 'created_at' => now()]);
            } else {
                abort_if(isset($data['delivery']), 422, 'Este pedido no es un domicilio.');
            }
            $order->customer_name = $data['customer_name'];
            $order->reference = $data['reference'];
            $order->revision++;
            $order->save();
            OrderEvent::create(['order_id' => $order->id, 'actor_id' => $actor->id, 'from_status' => $order->status, 'to_status' => $order->status, 'reason' => 'Datos de cliente actualizados: '.$data['reason'], 'created_at' => now()]);
            Audit::record('order.customer.updated', 'Se actualizaron datos del cliente de un pedido.', $actor, ['order_id' => $order->id, 'revision' => $order->revision, 'reason' => $data['reason']]);

            return $order;
        });
    }
}
