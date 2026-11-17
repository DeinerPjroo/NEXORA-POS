<?php

namespace App\Domains\Sales;

use App\Domains\Operations\Money;
use App\Models\Order;
use App\Models\SalesSetting;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaleTotals
{
    public static function cashRules(): array
    {
        return ['string', 'regex:/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/D'];
    }

    public static function round(string $value): string
    {
        return Money::bounded(bcadd($value, '0.005', 2));
    }

    public function calculate(Order $order, SalesSetting $settings, string $discount): array
    {
        abort_unless($settings->configured, 409, 'Confirma la configuración de ventas antes del primer cobro.');
        abort_if($order->status === 'cancelled', 409, 'No se puede cobrar un pedido cancelado.');
        abort_if($order->sale()->exists(), 409, 'Este pedido ya tiene una venta registrada.');
        if (bccomp($discount, '0', 4) > 0) {
            Gate::authorize('sales.discount');
        }
        $subtotal = self::round($order->subtotal);
        if (bccomp($discount, $subtotal, 4) > 0) {
            throw ValidationException::withMessages(['discount_amount' => 'El descuento supera el subtotal.']);
        }
        $base = bcsub($subtotal, $discount, 4);
        $tax = $settings->tax_mode === 'exclusive' ? self::round(bcdiv(bcmul($base, $settings->tax_rate, 8), '100', 8)) : '0.0000';
        $total = Money::bounded(bcadd($base, $tax, 4));
        if (bccomp($total, '0', 4) <= 0) {
            throw ValidationException::withMessages(['discount_amount' => 'El total debe ser mayor que cero para registrar un cobro.']);
        }

        return [
            'currency' => $order->currency, 'catalog_subtotal' => $order->subtotal, 'subtotal' => $subtotal,
            'rounding_adjustment' => bcsub($subtotal, $order->subtotal, 4),
            'discount_amount' => Money::normalize($discount), 'taxable_base' => $base,
            'tax_mode' => $settings->tax_mode, 'tax_name' => $settings->tax_name, 'tax_rate' => $settings->tax_rate,
            'tax_amount' => $tax, 'total' => $total, 'settings_revision' => $settings->revision,
        ];
    }
}
