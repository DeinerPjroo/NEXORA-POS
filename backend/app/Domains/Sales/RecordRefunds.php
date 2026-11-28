<?php

namespace App\Domains\Sales;

use App\Models\CourierCollection;
use App\Models\Sale;
use App\Models\SaleRefund;
use App\Models\User;
use Illuminate\Validation\ValidationException;

final class RecordRefunds
{
    // Solo se invoca con empresa y venta bloqueadas en la transacción idempotente.
    public function execute(User $actor, Sale $sale, array $data, array $lines): string
    {
        $sale->load('payments', 'refunds');
        $returned = app(SaleBalance::class)->refundedByPayment($sale);
        $sum = '0.0000';
        $custody = isset($data['custody_collection_id']);
        abort_if($custody && count($lines) !== 1, 422, 'La devolución en custodia corresponde a un solo pago.');
        foreach ($lines as $index => $line) {
            $payment = $sale->payments->firstWhere('id', (int) $line['payment_id']);
            abort_unless($payment, 404);
            $previous = $returned[$payment->id] ?? '0.0000';
            $remaining = bcsub($payment->amount, $previous, 4);
            if (bccomp($line['amount'], '0', 4) <= 0 || bccomp($line['amount'], $remaining, 4) > 0) {
                throw ValidationException::withMessages(['refunds' => 'Cada devolución debe ser positiva y no superar el importe aún devolvible del pago original.']);
            }
            $cash = $payment->method_kind === 'cash';
            $reference = $line['reference'] ?? null;
            if (! $cash && ! filled($reference)) {
                throw ValidationException::withMessages(['refunds' => 'Registra una referencia para cada devolución no efectiva.']);
            }
            $collection = null;
            if ($custody) {
                $collection = CourierCollection::whereKey($data['custody_collection_id'])->where('sale_id', $sale->id)->where('payment_id', $payment->id)->lockForUpdate()->firstOrFail()->load('payment', 'settlements', 'custodyRefunds');
                abort_unless($cash && $payment->provenance === 'courier_cash', 409, 'El pago no es efectivo en custodia.');
                abort_unless($collection->revision() === (int) $data['collection_revision'] && bccomp($collection->pending(), $data['expected_pending'], 4) === 0, 409, 'La custodia cambió; actualiza los saldos.');
                abort_unless(bccomp($line['amount'], $collection->pending(), 4) <= 0, 422, 'El repartidor no conserva suficiente efectivo de este cobro.');
                abort_unless(filter_var($data['confirmed_handover'] ?? false, FILTER_VALIDATE_BOOLEAN), 422, 'Confirma que el repartidor devolvió el efectivo al cliente.');
            }
            $step = $custody ? [] : [...$data, 'cash_revision' => (int) $data['cash_revision'] + $index];
            $movement = $cash && ! $custody ? app(CashLedger::class)->record($actor, $step, $sale->branch_id, $sale->currency, $line['amount'], 'expense', 'Devolución recibo V-'.str_pad((string) $sale->receipt_number, 6, '0', STR_PAD_LEFT)) : null;
            if (! $cash) {
                app(CashLedger::class)->registerNonCash($step, $sale->branch_id, $sale->currency);
            }
            SaleRefund::create(['sale_id' => $sale->id, 'payment_id' => $payment->id, 'branch_id' => $sale->branch_id, 'cash_session_id' => $custody ? null : $data['cash_session_id'],
                'courier_collection_id' => $collection?->id, 'confirmed_courier_handover' => $custody ? true : null,
                'cash_movement_id' => $movement?->id, 'actor_id' => $actor->id, 'amount' => $line['amount'], 'reason' => $data['reason'], 'reference' => $reference, 'created_at' => now()]);
            $returned[$payment->id] = bcadd($previous, $line['amount'], 4);
            $sum = bcadd($sum, $line['amount'], 4);
        }
        $sale->unsetRelation('refunds');

        return $sum;
    }
}
