<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class AddPayments
{
    public function execute(User $actor, Sale $sale, array $data): Sale
    {
        Gate::authorize('sales.collect');

        return app(IdempotentOperation::class)->run($actor, 'sale.payments.'.$sale->id, $data, Sale::class, function ($data) use ($actor, $sale) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            $balance = app(SaleBalance::class)->amounts($sale)['balance_due'];
            abort_unless(in_array($sale->status, ['partially_paid', 'partially_refunded'], true) && bccomp($balance, '0', 4) > 0, 409, 'Esta venta no tiene saldo pendiente que pueda cobrarse.');
            abort_unless($sale->revision === (int) $data['sale_revision'] && bccomp($balance, $data['expected_balance'], 4) === 0, 409, 'La venta cambió. Actualiza el saldo antes de registrar pagos.');
            app(RecordPayments::class)->execute($actor, $sale, $data, $data['payments']);
            Audit::record('sale.payments.recorded', 'Se agregaron pagos manuales a una venta.', $actor, ['sale_id' => $sale->id, 'revision' => $sale->revision]);

            return $sale;
        });
    }
}
