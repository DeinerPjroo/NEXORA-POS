<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Models\Order;
use App\Models\Payment;
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
        if (bccomp($data['discount_amount'], '0', 4) > 0) {
            Gate::authorize('sales.discount');
        }

        return app(IdempotentOperation::class)->run($actor, 'sale.collect.'.$order->id, $data, Sale::class, function ($data) use ($actor, $order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $settings = SalesSetting::lockForUpdate()->firstOrFail();
            abort_unless($order->revision === (int) $data['order_revision'] && $settings->revision === (int) $data['settings_revision'], 409, 'Cambió el pedido o la configuración. Revisa el total antes de cobrar.');
            $branch = $order->branch()->lockForUpdate()->firstOrFail();
            abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
            $totals = app(SaleTotals::class)->calculate($order, $settings, $data['discount_amount']);
            abort_unless(bccomp($totals['total'], $data['expected_total'], 4) === 0, 409, 'El total cambió. Revisa el cobro.');
            if (bccomp($data['received_amount'], $totals['total'], 4) < 0) {
                throw ValidationException::withMessages(['received_amount' => 'El efectivo recibido no alcanza para cubrir el total.']);
            }
            $sale = Sale::create([...$totals, 'branch_id' => $branch->id, 'order_id' => $order->id, 'created_by' => $actor->id,
                'receipt_number' => $settings->next_receipt_number, 'status' => 'paid', 'business_name' => $actor->tenant()->value('name'),
                'branch_name' => $branch->name, 'branch_address' => $branch->address, 'discount_reason' => $data['discount_reason'] ?? null]);
            $movement = app(CashLedger::class)->record($actor, $data, $branch->id, $order->currency, $sale->total, 'income', 'Cobro recibo V-'.str_pad((string) $sale->receipt_number, 6, '0', STR_PAD_LEFT));
            Payment::create(['sale_id' => $sale->id, 'branch_id' => $branch->id, 'cash_session_id' => $movement->cash_session_id,
                'cash_movement_id' => $movement->id, 'actor_id' => $actor->id, 'amount' => $sale->total, 'method' => 'cash',
                'received_amount' => Money::normalize($data['received_amount']), 'change_amount' => bcsub($data['received_amount'], $sale->total, 4), 'created_at' => now()]);
            $settings->next_receipt_number++;
            $settings->save();
            $order->revision++;
            $order->save();
            Audit::record('sale.paid', 'Se registró una venta cobrada en efectivo.', $actor, ['sale_id' => $sale->id, 'order_id' => $order->id, 'total' => $sale->total]);

            return $sale;
        });
    }
}
