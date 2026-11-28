<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\DeliveryEvent;
use App\Models\Order;
use App\Models\OrderDelivery;
use App\Models\PaymentMethod;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class PlanDeliveryPayment
{
    public function execute(User $actor, OrderDelivery $delivery, array $data): OrderDelivery
    {
        Gate::authorize('orders.view');
        Gate::authorize('orders.manage');

        return app(IdempotentOperation::class)->run($actor, 'delivery.payment.plan.'.$delivery->id, $data, OrderDelivery::class, function ($data) use ($actor, $delivery) {
            $delivery = OrderDelivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            $order = Order::whereKey($delivery->order_id)->lockForUpdate()->firstOrFail();
            abort_unless($delivery->revision === (int) $data['revision'], 409, 'La entrega cambió. Actualiza antes de continuar.');
            abort_unless(in_array($delivery->status, ['pending', 'assigned'], true) && $order->status !== 'cancelled' && ! $order->sale()->exists(), 409, 'Solo puedes cambiar el método previsto antes de salir a reparto y de registrar una venta.');
            $method = $data['payment_method_id'] === null ? null : PaymentMethod::whereKey($data['payment_method_id'])->lockForUpdate()->firstOrFail();
            if ($method) {
                abort_unless($method->is_active && $method->revision === (int) $data['method_revision'], 409, 'El método cambió o está inactivo. Actualiza la selección.');
            }
            $snapshot = $method ? $method->only('id', 'name', 'kind', 'revision') : null;
            $delivery->expected_payment_method_id = $method?->id;
            $delivery->payment_expectation = $snapshot;
            $delivery->revision++;
            $delivery->save();
            DeliveryEvent::create(['order_id' => $order->id, 'order_delivery_id' => $delivery->id, 'actor_id' => $actor->id, 'courier_id' => $delivery->courier_id, 'status' => $delivery->status, 'reason' => mb_substr('Método previsto: '.($method?->name ?? 'sin definir').'. '.$data['reason'], 0, 250), 'created_at' => now()]);
            Audit::record('delivery.payment.planned', 'Se actualizó una instrucción de pago previsto, sin registrar un pago.', $actor, ['delivery_id' => $delivery->id, 'revision' => $delivery->revision, 'payment_expectation' => $snapshot, 'reason' => $data['reason']]);

            return $delivery;
        });
    }
}
