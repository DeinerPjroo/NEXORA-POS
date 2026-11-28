<?php

namespace App\Domains\Sales;

use App\Domains\Operations\Money;
use App\Domains\Orders\CourierCollections;
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
        $sale->load('payments', 'refunds', 'accounts');
        $custody = isset($sessionData['custody_delivery_id']);
        abort_if($custody && (count($lines) !== 1 || $sale->accounts->isNotEmpty() || $sale->payments->isNotEmpty() || bccomp($lines[0]['amount'], $sale->total, 4) !== 0), 422, 'El cobro en reparto inicial debe ser completo, sin división ni pagos anteriores.');
        $balance = app(SaleBalance::class)->amounts($sale)['balance_due'];
        $accountBalances = collect(app(SplitAccounts::class)->balances($sale))->keyBy('id')->map(fn ($account) => $account['balance_due'])->all();
        $sum = '0.0000';
        foreach ($lines as $line) {
            if (bccomp($line['amount'], '0', 4) <= 0) {
                throw ValidationException::withMessages(['payments' => 'Cada pago debe ser mayor que cero.']);
            }
            if ($sale->accounts->isNotEmpty()) {
                if (! isset($line['account_id'])) {
                    throw ValidationException::withMessages(['payments' => 'Asigna cada pago a una cuenta de esta venta.']);
                }
                abort_unless(array_key_exists($line['account_id'], $accountBalances), 404);
                if (bccomp($line['amount'], $accountBalances[$line['account_id']], 4) > 0) {
                    throw ValidationException::withMessages(['payments' => 'Los pagos superan el saldo de la cuenta elegida.']);
                }
                $accountBalances[$line['account_id']] = bcsub($accountBalances[$line['account_id']], $line['amount'], 4);
            } elseif (isset($line['account_id'])) {
                throw ValidationException::withMessages(['payments' => 'Esta venta no tiene división de cuentas.']);
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
            abort_if($custody && ! $cash, 422, 'La custodia admite únicamente efectivo realmente recibido.');
            if (bccomp($line['received_amount'], $line['amount'], 4) < 0 || (! $cash && (! filled($line['reference'] ?? null) || bccomp($line['received_amount'], $line['amount'], 4) !== 0))) {
                throw ValidationException::withMessages(['payments' => 'Revisa recibido y cambio; los pagos no efectivos exigen referencia e importe exacto.']);
            }
            // Cada línea del mismo comando avanza la revisión bajo el bloqueo común.
            $step = $custody ? [] : [...$sessionData, 'cash_revision' => (int) $sessionData['cash_revision'] + $index];
            $movement = $cash && ! $custody ? app(CashLedger::class)->record($actor, $step, $sale->branch_id, $sale->currency, $line['amount'], 'income', 'Cobro recibo V-'.str_pad((string) $sale->receipt_number, 6, '0', STR_PAD_LEFT)) : null;
            if (! $cash) {
                app(CashLedger::class)->registerNonCash($step, $sale->branch_id, $sale->currency);
            }
            $payment = Payment::create(['sale_id' => $sale->id, 'account_id' => $line['account_id'] ?? null, 'branch_id' => $sale->branch_id, 'cash_session_id' => $custody ? null : $sessionData['cash_session_id'],
                'cash_movement_id' => $movement?->id, 'actor_id' => $actor->id, 'amount' => Money::normalize($line['amount']), 'method' => $method->code,
                'payment_method_id' => $method->id, 'method_name' => $method->name, 'method_kind' => $method->kind, 'method_revision' => $method->revision,
                'provenance' => $custody ? 'courier_cash' : 'operator', 'reference' => $line['reference'] ?? null, 'received_amount' => Money::normalize($line['received_amount']),
                'change_amount' => bcsub($line['received_amount'], $line['amount'], 4), 'created_at' => now()]);
            if ($custody) {
                app(CourierCollections::class)->record($actor, $sale, $payment, $sessionData);
            }
        }
        $sale->status = $sale->refunds->isNotEmpty() ? 'partially_refunded' : (bccomp($sum, $balance, 4) === 0 ? 'paid' : 'partially_paid');
        $sale->revision++;
        $sale->save();
        $sale->unsetRelation('payments');
        $sale->unsetRelation('refunds');
    }
}
