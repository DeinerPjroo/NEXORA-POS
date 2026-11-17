<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Sale;
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
            abort_unless(in_array($sale->status, ['paid', 'partially_paid', 'partially_refunded'], true), 409, 'Esta venta ya está cerrada por devolución.');
            $sale->load('payments', 'refunds');
            abort_if(isset($data['sale_revision']) && $sale->revision !== (int) $data['sale_revision'], 409, 'La venta cambió. Revisa los pagos antes de devolver.');
            if (($sale->status !== 'paid' || $sale->payments->count() > 1) && ! isset($data['sale_revision'])) {
                throw ValidationException::withMessages(['sale_revision' => 'Confirma la revisión de la venta y sus pagos antes de devolver.']);
            }
            $references = collect($data['refund_references'] ?? [])->keyBy('payment_id');
            if ($references->keys()->diff($sale->payments->pluck('id'))->isNotEmpty()) {
                throw ValidationException::withMessages(['refund_references' => 'Hay referencias que no corresponden a pagos de esta venta.']);
            }
            $returned = app(SaleBalance::class)->refundedByPayment($sale);
            $remaining = $sale->payments->filter(fn ($payment) => bccomp($payment->amount, $returned[$payment->id] ?? '0', 4) > 0);
            $nonCashCount = $remaining->where('method_kind', 'non_cash')->count();
            $lines = [];
            foreach ($remaining as $payment) {
                $reference = $references->get($payment->id)['reference'] ?? ($nonCashCount === 1 ? ($data['refund_reference'] ?? null) : null);
                if ($payment->method_kind !== 'cash' && ! filled($reference)) {
                    throw ValidationException::withMessages(['refund_references' => 'Registra una referencia para cada devolución no efectiva.']);
                }
                $lines[] = ['payment_id' => $payment->id, 'amount' => bcsub($payment->amount, $returned[$payment->id] ?? '0', 4), 'reference' => $reference];
            }
            $amounts = app(SaleBalance::class)->amounts($sale);
            $returnedNow = app(RecordRefunds::class)->execute($actor, $sale, $data, $lines);
            if ($lines === []) {
                // Cierre explícito de deuda tras devolver todos los abonos: valida y avanza
                // la sesión sin inventar un movimiento ni una devolución de importe cero.
                app(CashLedger::class)->registerNonCash($data, $sale->branch_id, $sale->currency);
            }
            $sale->status = 'refunded';
            $sale->revision++;
            $sale->save();
            Audit::record('sale.refunded', 'Se devolvió el remanente de los pagos recibidos y se canceló el saldo pendiente.', $actor, ['sale_id' => $sale->id, 'amount' => $returnedNow, 'cancelled_balance' => $amounts['balance_due'], 'reason' => $data['reason'], 'provenance' => 'operator']);

            return $sale;
        });
    }
}
