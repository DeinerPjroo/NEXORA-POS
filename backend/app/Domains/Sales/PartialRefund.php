<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class PartialRefund
{
    public function execute(User $actor, Sale $sale, array $data): Sale
    {
        Gate::authorize('sales.refund');

        return app(IdempotentOperation::class)->run($actor, 'sale.refunds.'.$sale->id, $data, Sale::class, function ($data) use ($actor, $sale) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($sale->status, ['paid', 'partially_paid', 'partially_refunded'], true), 409, 'Esta venta está cerrada por devolución.');
            $amounts = app(SaleBalance::class)->amounts($sale);
            abort_unless($sale->revision === (int) $data['sale_revision'] && bccomp($amounts['net_paid_amount'], $data['expected_refundable'], 4) === 0, 409, 'La venta cambió. Revisa los importes devolvibles.');
            $amount = app(RecordRefunds::class)->execute($actor, $sale, $data, $data['refunds']);
            $after = app(SaleBalance::class)->amounts($sale);
            $sale->status = bccomp($after['net_paid_amount'], '0', 4) === 0 && bccomp($after['balance_due'], '0', 4) === 0 ? 'refunded' : 'partially_refunded';
            $sale->revision++;
            $sale->save();
            Audit::record('sale.partially_refunded', 'Se devolvieron importes de pagos originales sin crear ni cancelar saldo pendiente.', $actor, ['sale_id' => $sale->id, 'amount' => $amount, 'reason' => $data['reason'], 'provenance' => 'operator']);

            return $sale;
        });
    }
}
