<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Domains\Sales\CashLedger;
use App\Models\CourierCollection;
use App\Models\CourierSettlement;
use App\Models\DeliveryEvent;
use App\Models\OrderDelivery;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class CourierCollections
{
    public function record(User $actor, Sale $sale, Payment $payment, array $data): void
    {
        Gate::authorize('orders.view');
        Gate::authorize('orders.manage');
        Gate::authorize('sales.collect');
        abort_unless($payment->sale_id === $sale->id && $payment->cash_session_id === null && $payment->cash_movement_id === null && $payment->method_kind === 'cash' && $payment->provenance === 'courier_cash', 409, 'El pago no corresponde a efectivo en custodia de esta venta.');
        abort_unless(filter_var($data['confirmed_received'] ?? false, FILTER_VALIDATE_BOOLEAN), 422, 'Confirma que el repartidor recibió el efectivo.');
        $delivery = OrderDelivery::whereKey($data['custody_delivery_id'])->where('order_id', $sale->order_id)->where('branch_id', $sale->branch_id)->lockForUpdate()->firstOrFail();
        abort_unless($delivery->revision === (int) $data['delivery_revision'] && in_array($delivery->status, ['out_for_delivery', 'delivered'], true), 409, 'Actualiza la entrega; debe haber salido a reparto.');
        $courier = User::where('tenant_id', $actor->tenant_id)->whereKey($delivery->courier_id)->firstOrFail();
        abort_unless($courier->is_active && $courier->hasPermission('deliveries.operate') && $courier->canAccessBranch($sale->branch_id), 409, 'Revisa los accesos del repartidor.');
        $collection = CourierCollection::create(['branch_id' => $sale->branch_id, 'order_id' => $sale->order_id, 'order_delivery_id' => $delivery->id, 'sale_id' => $sale->id, 'payment_id' => $payment->id, 'courier_id' => $courier->id, 'confirmed_received' => true, 'reason' => $data['reason'], 'created_at' => now()]);
        $delivery->revision++;
        $delivery->save();
        DeliveryEvent::create(['order_id' => $sale->order_id, 'order_delivery_id' => $delivery->id, 'actor_id' => $actor->id, 'courier_id' => $courier->id, 'status' => $delivery->status, 'reason' => 'Cobro en efectivo recibido por repartidor, pendiente de rendición.', 'created_at' => now()]);
        Audit::record('courier.collection.recorded', 'Se registró un pago real en custodia, sin ingreso de caja.', $actor, ['collection_id' => $collection->id, 'payment_id' => $payment->id, 'sale_id' => $sale->id, 'courier_id' => $courier->id, 'amount' => $payment->amount, 'reason' => $data['reason']]);
    }

    public function settle(User $actor, CourierCollection $collection, array $data): CourierSettlement
    {
        foreach (['orders.view', 'orders.manage', 'cash.view', 'cash.movements'] as $permission) {
            Gate::authorize($permission);
        }

        return app(IdempotentOperation::class)->run($actor, 'courier.settlement.'.$collection->id, $data, CourierSettlement::class, function ($data) use ($actor, $collection) {
            $collection = CourierCollection::whereKey($collection->id)->lockForUpdate()->firstOrFail()->load('payment', 'sale', 'settlements');
            $pending = $collection->pending();
            abort_unless($collection->settlements->count() + 1 === (int) $data['collection_revision'] && bccomp($pending, $data['expected_pending'], 4) === 0, 409, 'La rendición cambió. Actualiza el saldo pendiente.');
            $amount = Money::normalize($data['amount']);
            abort_unless(bccomp($amount, '0', 4) > 0 && bccomp($amount, $pending, 4) <= 0, 422, 'El importe debe ser positivo y no superar el efectivo pendiente.');
            abort_unless(filter_var($data['confirmed_handover'] ?? false, FILTER_VALIDATE_BOOLEAN), 422, 'Confirma la entrega física de efectivo.');
            $movement = app(CashLedger::class)->record($actor, $data, $collection->branch_id, $collection->sale->currency, $amount, 'income', 'Rendición de cobro en reparto #'.$collection->id);
            $settlement = CourierSettlement::create(['branch_id' => $collection->branch_id, 'courier_collection_id' => $collection->id, 'cash_session_id' => $data['cash_session_id'], 'cash_movement_id' => $movement->id, 'actor_id' => $actor->id, 'amount' => $amount, 'reason' => $data['reason'], 'confirmed_handover' => true, 'created_at' => now()]);
            Audit::record('courier.collection.settled', 'Se recibió físicamente efectivo de un cobro ya registrado, sin crear otro pago.', $actor, ['settlement_id' => $settlement->id, 'collection_id' => $collection->id, 'payment_id' => $collection->payment_id, 'amount' => $amount, 'reason' => $data['reason']]);

            return $settlement;
        });
    }
}
