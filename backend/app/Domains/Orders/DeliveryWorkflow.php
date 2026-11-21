<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Kitchen\KitchenWorkflow;
use App\Domains\Operations\IdempotentOperation;
use App\Models\DeliveryEvent;
use App\Models\Order;
use App\Models\OrderDelivery;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class DeliveryWorkflow
{
    public function create(User $actor, Order $order, array $data): void
    {
        $fee = app(DeliveryFeePlan::class)->resolve($actor, $order->branch_id, $order->currency, $order->subtotal, $data);
        $data = app(DeliveryCustomerSnapshot::class)->resolve($actor, $order->branch_id, $data);
        if (! filled($order->customer_name)) {
            $order->customer_name = $data['customer_snapshot']['customer']['name'] ?? $data['recipient_name'];
            $order->save();
        }
        $delivery = OrderDelivery::create([...$data, ...$fee, 'order_id' => $order->id, 'branch_id' => $order->branch_id, 'status' => 'pending', 'revision' => 1]);
        if ($fee['fee_snapshot']) {
            Audit::record('delivery.fee.confirmed', 'Se confirmó la tarifa de domicilio.', $actor, ['order_id' => $order->id, 'fee_total' => $fee['fee_total'], 'source' => $fee['fee_snapshot']['source'], 'reason' => $fee['fee_snapshot']['reason']]);
        }
        $this->event($actor, $delivery, 'Domicilio registrado.');
    }

    public function change(User $actor, OrderDelivery $delivery, array $data): OrderDelivery
    {
        abort_unless($actor->can('orders.manage') || $actor->can('deliveries.operate'), 403);
        abort_unless($actor->can('orders.manage') || (int) $delivery->courier_id === $actor->id, 403);

        return app(IdempotentOperation::class)->run($actor, 'delivery.state.'.$delivery->id, $data, OrderDelivery::class, function ($data) use ($actor, $delivery) {
            $delivery = OrderDelivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->can('orders.manage') || (int) $delivery->courier_id === $actor->id, 403);
            abort_unless($delivery->revision === (int) $data['revision'], 409, 'La entrega cambió. Actualiza antes de continuar.');
            $order = Order::whereKey($delivery->order_id)->lockForUpdate()->firstOrFail();
            abort_if($order->status === 'cancelled' || in_array($delivery->status, ['delivered', 'cancelled'], true), 409, 'La entrega está finalizada.');
            if ($data['status'] === 'assigned') {
                Gate::authorize('orders.manage');
                abort_unless(in_array($delivery->status, ['pending', 'assigned'], true), 409, 'El domicilio ya salió a reparto.');
                $courier = User::where('tenant_id', $actor->tenant_id)->whereKey($data['courier_id'])->firstOrFail();
                abort_unless($courier->hasPermission('deliveries.operate') && $courier->canAccessBranch($delivery->branch_id), 422, 'El repartidor no está autorizado en esta sucursal.');
                $delivery->courier_id = $courier->id;
            } else {
                $next = ['assigned' => 'out_for_delivery', 'out_for_delivery' => 'delivered'];
                abort_unless(($next[$delivery->status] ?? null) === $data['status'], 409, 'No se permite ese cambio de entrega.');
                $courier = User::where('tenant_id', $actor->tenant_id)->whereKey($delivery->courier_id)->firstOrFail();
                abort_unless($courier->hasPermission('deliveries.operate') && $courier->canAccessBranch($delivery->branch_id), 409, 'Revisa los accesos del repartidor.');
                if ($data['status'] === 'out_for_delivery') {
                    abort_unless(in_array($order->status, ['ready', 'delivered'], true), 409, 'Cocina debe marcar el pedido listo antes del reparto.');
                    $delivery->out_at = now();
                    app(KitchenWorkflow::class)->handOffForDelivery($actor, $order);
                } else {
                    $delivery->delivered_at = now();
                }
            }
            $delivery->status = $data['status'];
            $delivery->revision++;
            $delivery->save();
            $this->event($actor, $delivery, $data['reason'] ?? null);
            Audit::record('delivery.status', 'Se actualizó una entrega a domicilio.', $actor, ['delivery_id' => $delivery->id, 'status' => $delivery->status]);

            return $delivery;
        });
    }

    public function cancel(User $actor, Order $order, ?string $reason): void
    {
        $delivery = OrderDelivery::where('order_id', $order->id)->lockForUpdate()->first();
        if (! $delivery) {
            return;
        }
        abort_if($delivery->status === 'delivered', 409, 'El domicilio ya se entregó.');
        $delivery->status = 'cancelled';
        $delivery->revision++;
        $delivery->save();
        $this->event($actor, $delivery, $reason);
    }

    private function event(User $actor, OrderDelivery $d, ?string $reason): void
    {
        DeliveryEvent::create(['order_id' => $d->order_id, 'order_delivery_id' => $d->id, 'actor_id' => $actor->id, 'courier_id' => $d->courier_id, 'status' => $d->status, 'reason' => $reason, 'created_at' => now()]);
    }
}
