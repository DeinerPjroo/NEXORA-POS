<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Kitchen\KitchenWorkflow;
use App\Domains\Operations\IdempotentOperation;
use App\Models\CourierAvailability;
use App\Models\DeliveryEvent;
use App\Models\Order;
use App\Models\OrderDelivery;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;

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
        Gate::authorize('orders.view');
        abort_unless($actor->can('orders.manage') || $actor->can('deliveries.operate'), 403);
        abort_unless($actor->can('orders.manage') || (int) $delivery->courier_id === $actor->id, 403);

        return app(IdempotentOperation::class)->run($actor, 'delivery.state.'.$delivery->id, $data, OrderDelivery::class, function ($data) use ($actor, $delivery) {
            $delivery = OrderDelivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->can('orders.manage') || (int) $delivery->courier_id === $actor->id, 403);
            abort_unless($delivery->revision === (int) $data['revision'], 409, 'La entrega cambió. Actualiza antes de continuar.');
            $order = Order::whereKey($delivery->order_id)->lockForUpdate()->firstOrFail();
            abort_if($order->status === 'cancelled' || in_array($delivery->status, ['delivered', 'cancelled', 'returned'], true), 409, 'La entrega está finalizada.');
            $previousCourier = $delivery->courier_id;
            $from = $delivery->status;
            if ($data['status'] === 'assigned') {
                Gate::authorize('orders.manage');
                abort_unless(in_array($delivery->status, ['pending', 'assigned'], true), 409, 'El domicilio ya salió a reparto.');
                $courier = User::where('tenant_id', $actor->tenant_id)->whereKey($data['courier_id'])->firstOrFail();
                abort_unless($courier->is_active && $courier->hasPermission('deliveries.operate') && $courier->canAccessBranch($delivery->branch_id), 422, 'El repartidor no está autorizado en esta sucursal.');
                abort_if(CourierAvailability::where('branch_id', $delivery->branch_id)->where('user_id', $courier->id)->where('available', false)->exists(), 409, 'El repartidor fue marcado como no disponible.');
                if ($previousCourier !== null) {
                    abort_if((int) $previousCourier === $courier->id, 409, 'El repartidor ya está asignado.');
                    Validator::make($data, ['reason' => ['required', 'string', 'min:3', 'max:250']])->validate();
                }
                $delivery->courier_id = $courier->id;
            } else {
                $next = ['assigned' => ['out_for_delivery'], 'out_for_delivery' => ['delivered', 'failed'], 'failed' => ['returned']];
                abort_unless(in_array($data['status'], $next[$delivery->status] ?? [], true), 409, 'No se permite ese cambio de entrega.');
                $courier = User::where('tenant_id', $actor->tenant_id)->whereKey($delivery->courier_id)->firstOrFail();
                if (! in_array($data['status'], ['failed', 'returned'], true)) {
                    abort_unless($courier->is_active && $courier->hasPermission('deliveries.operate') && $courier->canAccessBranch($delivery->branch_id), 409, 'Revisa los accesos del repartidor.');
                }
                if ($data['status'] === 'out_for_delivery') {
                    abort_if(CourierAvailability::where('branch_id', $delivery->branch_id)->where('user_id', $courier->id)->where('available', false)->exists(), 409, 'El repartidor fue marcado como no disponible.');
                    abort_unless(in_array($order->status, ['ready', 'delivered'], true), 409, 'Cocina debe marcar el pedido listo antes del reparto.');
                    $delivery->out_at = now();
                    app(KitchenWorkflow::class)->handOffForDelivery($actor, $order);
                } elseif ($data['status'] === 'delivered') {
                    $delivery->delivered_at = now();
                }
            }
            $delivery->status = $data['status'];
            $delivery->revision++;
            $delivery->save();
            $this->event($actor, $delivery, $data['reason'] ?? null);
            Audit::record('delivery.status', 'Se actualizó una entrega a domicilio.', $actor, ['delivery_id' => $delivery->id, 'from_status' => $from, 'status' => $delivery->status, 'previous_courier_id' => $previousCourier, 'courier_id' => $delivery->courier_id, 'reason' => $data['reason'] ?? null]);

            return $delivery;
        });
    }

    public function recordItemChange(User $actor, OrderDelivery $delivery, string $reason): void
    {
        $delivery->revision++;
        $delivery->save();
        $this->event($actor, $delivery, mb_substr('Corrección de productos: '.$reason, 0, 300));
    }

    public function recordAddition(User $actor, Order $order, int $revision): void
    {
        $delivery = OrderDelivery::where('order_id', $order->id)->lockForUpdate()->firstOrFail();
        abort_unless($delivery->revision === $revision, 409, 'El domicilio cambió. Actualízalo antes de agregar productos.');
        abort_unless(in_array($delivery->status, ['pending', 'assigned'], true), 409, 'Solo puedes agregar productos antes de salir a reparto.');
        $delivery->revision++;
        $delivery->save();
        $this->event($actor, $delivery, 'Se agregaron productos al pedido. Se conserva la tarifa de envío registrada.');
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
