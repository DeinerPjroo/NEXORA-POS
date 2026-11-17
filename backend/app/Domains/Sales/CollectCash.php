<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Order;
use App\Models\Sale;
use App\Models\SalesSetting;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class CollectCash
{
    public function execute(User $actor, Order $order, array $data): Sale
    {
        Gate::authorize('sales.collect');
        if (bccomp(($data['discount_type'] ?? 'fixed') === 'percentage' ? $data['discount_value'] : $data['discount_amount'], '0', 4) > 0) {
            Gate::authorize('sales.discount');
        }
        if (bccomp($data['tip_amount'] ?? '0', '0', 4) > 0) {
            Gate::authorize('sales.tips');
            if (! filter_var($data['tip_confirmed'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                throw ValidationException::withMessages(['tip_confirmed' => 'Confirma que la propina fue aceptada voluntariamente.']);
            }
        }

        return app(IdempotentOperation::class)->run($actor, 'sale.collect.'.$order->id, $data, Sale::class, function ($data) use ($actor, $order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $settings = SalesSetting::lockForUpdate()->firstOrFail();
            abort_unless($order->revision === (int) $data['order_revision'] && $settings->revision === (int) $data['settings_revision'], 409, 'Cambió el pedido o la configuración. Revisa el total antes de cobrar.');
            $branch = $order->branch()->lockForUpdate()->firstOrFail();
            abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
            $totals = app(SaleTotals::class)->calculate($order, $settings, $data['discount_amount'] ?? '0', $data);
            abort_unless(bccomp($totals['total'], $data['expected_total'], 4) === 0, 409, 'El total cambió. Revisa el cobro.');
            $sale = Sale::create([...$totals, 'branch_id' => $branch->id, 'order_id' => $order->id, 'created_by' => $actor->id,
                'receipt_number' => $settings->next_receipt_number, 'status' => 'paid', 'business_name' => $actor->tenant()->value('name'),
                'branch_name' => $branch->name, 'branch_address' => $branch->address, 'discount_reason' => $data['discount_reason'] ?? null, 'tip_confirmed' => bccomp($totals['tip_amount'], '0', 4) > 0])->refresh();
            $line = ['amount' => $data['payment_amount'] ?? $sale->total, 'received_amount' => $data['received_amount'], 'reference' => $data['payment_reference'] ?? null];
            if (isset($data['payment_method_id'])) {
                $line += ['payment_method_id' => $data['payment_method_id'], 'method_revision' => $data['method_revision']];
            }
            app(RecordPayments::class)->execute($actor, $sale, $data, [$line]);
            $settings->next_receipt_number++;
            $settings->save();
            $order->revision++;
            $order->save();
            Audit::record($sale->status === 'paid' ? 'sale.paid' : 'sale.partially_paid', 'Se registró una venta con pago declarado por el operador.', $actor, ['sale_id' => $sale->id, 'order_id' => $order->id, 'total' => $sale->total, 'provenance' => 'operator', 'discount_type' => $sale->discount_type, 'discount_value' => $sale->discount_value, 'tip_amount' => $sale->tip_amount, 'tip_confirmed' => $sale->tip_confirmed, 'tip_tax_mode' => $sale->tip_tax_mode]);

            return $sale;
        });
    }
}
