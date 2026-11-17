<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Sale;
use App\Models\SaleRefund;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class RefundCash
{
    public function execute(User $actor, Sale $sale, array $data): Sale
    {
        Gate::authorize('sales.refund');

        return app(IdempotentOperation::class)->run($actor, 'sale.refund.'.$sale->id, $data, Sale::class, function ($data) use ($actor, $sale) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            abort_unless($sale->status === 'paid' && ! $sale->refund()->exists(), 409, 'Esta venta ya tiene una devolución.');
            $movement = app(CashLedger::class)->record($actor, $data, $sale->branch_id, $sale->currency, $sale->total, 'expense', 'Devolución recibo V-'.str_pad((string) $sale->receipt_number, 6, '0', STR_PAD_LEFT));
            SaleRefund::create(['sale_id' => $sale->id, 'branch_id' => $sale->branch_id, 'cash_session_id' => $movement->cash_session_id,
                'cash_movement_id' => $movement->id, 'actor_id' => $actor->id, 'amount' => $sale->total, 'reason' => $data['reason'], 'created_at' => now()]);
            $sale->status = 'refunded';
            $sale->save();
            Audit::record('sale.refunded', 'Se registró una devolución total en efectivo.', $actor, ['sale_id' => $sale->id, 'amount' => $sale->total, 'reason' => $data['reason']]);

            return $sale;
        });
    }
}
