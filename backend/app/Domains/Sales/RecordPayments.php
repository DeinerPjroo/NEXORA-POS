<?php

namespace App\Domains\Sales;

use App\Domains\Operations\Money;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Validation\ValidationException;

final class RecordPayments
{
    // Solo se invoca dentro de una transacción con empresa y venta bloqueadas.
    public function execute(User $actor, Sale $sale, array $sessionData, array $lines): void
    {
        $sale->load('payments', 'refunds');
        $balance = app(SaleBalance::class)->amounts($sale)['balance_due'];
        $sum = '0.0000';
        foreach ($lines as $line) {
            if (bccomp($line['amount'], '0', 4) <= 0) {
                throw ValidationException::withMessages(['payments' => 'Cada pago debe ser mayor que cero.']);
            }
            $sum = Money::bounded(bcadd($sum, $line['amount'], 4));
        }
        if (bccomp($sum, $balance, 4) > 0) {
            throw ValidationException::withMessages(['payments' => 'Los pagos superan el saldo pendiente de la venta.']);
        }
        foreach ($lines as $index => $line) {
            $method = PaymentMethod::when(isset($line['payment_method_id']), fn ($q) => $q->whereKey($line['payment_method_id']), fn ($q) => $q->where('code', 'cash'))->lockForUpdate()->firstOrFail();
            abort_unless($method->is_active, 409, 'El método de pago está inactivo.');
            abort_if(isset($line['payment_method_id']) && $method->revision !== (int) $line['method_revision'], 409, 'El método de pago cambió. Revisa sus datos.');
            $cash = $method->kind === 'cash';
            if (bccomp($line['received_amount'], $line['amount'], 4) < 0 || (! $cash && (! filled($line['reference'] ?? null) || bccomp($line['received_amount'], $line['amount'], 4) !== 0))) {
                throw ValidationException::withMessages(['payments' => 'Revisa recibido y cambio; los pagos no efectivos exigen referencia e importe exacto.']);
            }
            // Cada línea del mismo comando avanza la revisión bajo el bloqueo común.
            $step = [...$sessionData, 'cash_revision' => (int) $sessionData['cash_revision'] + $index];
            $movement = $cash ? app(CashLedger::class)->record($actor, $step, $sale->branch_id, $sale->currency, $line['amount'], 'income', 'Cobro recibo V-'.str_pad((string) $sale->receipt_number, 6, '0', STR_PAD_LEFT)) : null;
            if (! $cash) {
                app(CashLedger::class)->registerNonCash($step, $sale->branch_id, $sale->currency);
            }
            Payment::create(['sale_id' => $sale->id, 'branch_id' => $sale->branch_id, 'cash_session_id' => $sessionData['cash_session_id'],
                'cash_movement_id' => $movement?->id, 'actor_id' => $actor->id, 'amount' => Money::normalize($line['amount']), 'method' => $method->code,
                'payment_method_id' => $method->id, 'method_name' => $method->name, 'method_kind' => $method->kind, 'method_revision' => $method->revision,
                'provenance' => 'operator', 'reference' => $line['reference'] ?? null, 'received_amount' => Money::normalize($line['received_amount']),
                'change_amount' => bcsub($line['received_amount'], $line['amount'], 4), 'created_at' => now()]);
        }
        $sale->status = bccomp($sum, $balance, 4) === 0 ? 'paid' : 'partially_paid';
        $sale->revision++;
        $sale->save();
        $sale->unsetRelation('payments');
        $sale->unsetRelation('refunds');
    }
}
