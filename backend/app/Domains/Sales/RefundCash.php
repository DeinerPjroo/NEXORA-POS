<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Sale;
use App\Models\SaleRefund;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class RefundCash
{
    public function execute(User $actor, Sale $sale, array $data): Sale
    {
        Gate::authorize('sales.refund');

        return app(IdempotentOperation::class)->run($actor, 'sale.refund.'.$sale->id, $data, Sale::class, function ($data) use ($actor, $sale) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($sale->status, ['paid', 'partially_paid'], true) && ! $sale->refunds()->exists(), 409, 'Esta venta ya tiene una devolución.');
            $sale->load('payments', 'refunds');
            abort_if(isset($data['sale_revision']) && $sale->revision !== (int) $data['sale_revision'], 409, 'La venta cambió. Revisa los pagos antes de devolver.');
            if (($sale->status === 'partially_paid' || $sale->payments->count() > 1) && ! isset($data['sale_revision'])) {
                throw ValidationException::withMessages(['sale_revision' => 'Confirma la revisión de la venta y sus pagos antes de devolver.']);
            }
            $references = collect($data['refund_references'] ?? [])->keyBy('payment_id');
            if ($references->keys()->diff($sale->payments->pluck('id'))->isNotEmpty()) {
                throw ValidationException::withMessages(['refund_references' => 'Hay referencias que no corresponden a pagos de esta venta.']);
            }
            $nonCashCount = $sale->payments->where('method_kind', 'non_cash')->count();
            foreach ($sale->payments as $index => $payment) {
                $cash = $payment->method_kind === 'cash';
                $reference = $references->get($payment->id)['reference'] ?? ($nonCashCount === 1 ? ($data['refund_reference'] ?? null) : null);
                if (! $cash && ! filled($reference)) {
                    throw ValidationException::withMessages(['refund_references' => 'Registra una referencia para cada devolución no efectiva.']);
                }
                $step = [...$data, 'cash_revision' => (int) $data['cash_revision'] + $index];
                $movement = $cash ? app(CashLedger::class)->record($actor, $step, $sale->branch_id, $sale->currency, $payment->amount, 'expense', 'Devolución recibo V-'.str_pad((string) $sale->receipt_number, 6, '0', STR_PAD_LEFT)) : null;
                if (! $cash) {
                    app(CashLedger::class)->registerNonCash($step, $sale->branch_id, $sale->currency);
                }
                SaleRefund::create(['sale_id' => $sale->id, 'payment_id' => $payment->id, 'branch_id' => $sale->branch_id, 'cash_session_id' => $data['cash_session_id'],
                    'cash_movement_id' => $movement?->id, 'actor_id' => $actor->id, 'amount' => $payment->amount, 'reason' => $data['reason'], 'reference' => $reference, 'created_at' => now()]);
            }
            $amounts = app(SaleBalance::class)->amounts($sale);
            $sale->status = 'refunded';
            $sale->revision++;
            $sale->save();
            Audit::record('sale.refunded', 'Se devolvieron los pagos recibidos y se canceló el saldo pendiente.', $actor, ['sale_id' => $sale->id, 'amount' => $amounts['paid_amount'], 'cancelled_balance' => $amounts['balance_due'], 'reason' => $data['reason'], 'provenance' => 'operator']);

            return $sale;
        });
    }
}
