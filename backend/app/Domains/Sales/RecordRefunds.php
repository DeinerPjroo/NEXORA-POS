<?php

namespace App\Domains\Sales;

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
            $step = [...$data, 'cash_revision' => (int) $data['cash_revision'] + $index];
            $movement = $cash ? app(CashLedger::class)->record($actor, $step, $sale->branch_id, $sale->currency, $line['amount'], 'expense', 'Devolución recibo V-'.str_pad((string) $sale->receipt_number, 6, '0', STR_PAD_LEFT)) : null;
            if (! $cash) {
                app(CashLedger::class)->registerNonCash($step, $sale->branch_id, $sale->currency);
            }
            SaleRefund::create(['sale_id' => $sale->id, 'payment_id' => $payment->id, 'branch_id' => $sale->branch_id, 'cash_session_id' => $data['cash_session_id'],
                'cash_movement_id' => $movement?->id, 'actor_id' => $actor->id, 'amount' => $line['amount'], 'reason' => $data['reason'], 'reference' => $reference, 'created_at' => now()]);
            $returned[$payment->id] = bcadd($previous, $line['amount'], 4);
            $sum = bcadd($sum, $line['amount'], 4);
        }
        $sale->unsetRelation('refunds');

        return $sum;
    }
}
