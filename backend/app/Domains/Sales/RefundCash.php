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
            abort_unless($sale->status === 'paid' && ! $sale->refund()->exists(), 409, 'Esta venta ya tiene una devolución.');
            $payment = $sale->payment()->firstOrFail();
            $isCash = $payment->method_kind === 'cash';
            if (! $isCash && ! filled($data['refund_reference'] ?? null)) {
                throw ValidationException::withMessages(['refund_reference' => 'Registra la referencia de la devolución manual no efectiva.']);
            }
            $movement = $isCash ? app(CashLedger::class)->record($actor, $data, $sale->branch_id, $sale->currency, $sale->total, 'expense', 'Devolución recibo V-'.str_pad((string) $sale->receipt_number, 6, '0', STR_PAD_LEFT)) : null;
            if (! $isCash) {
                app(CashLedger::class)->registerNonCash($data, $sale->branch_id, $sale->currency);
            }
            SaleRefund::create(['sale_id' => $sale->id, 'branch_id' => $sale->branch_id, 'cash_session_id' => $data['cash_session_id'],
                'cash_movement_id' => $movement?->id, 'actor_id' => $actor->id, 'amount' => $sale->total, 'reason' => $data['reason'], 'reference' => $data['refund_reference'] ?? null, 'created_at' => now()]);
            $sale->status = 'refunded';
            $sale->save();
            Audit::record('sale.refunded', 'Se registró una devolución total declarada por el operador.', $actor, ['sale_id' => $sale->id, 'amount' => $sale->total, 'reason' => $data['reason'], 'method' => $payment->method, 'provenance' => 'operator']);

            return $sale;
        });
    }
}
