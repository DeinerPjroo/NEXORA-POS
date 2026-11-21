<?php

namespace App\Domains\Sales;

use App\Domains\Operations\Money;
use App\Models\Order;

final class ProductTaxTotals
{
    public function calculate(Order $order, string $subtotal, string $discount, string $tip, ?array $tipProfile): array
    {
        $items = $order->items->sortBy('id')->values();
        abort_if($items->contains(fn ($item) => $item->tax_snapshot === null), 409, 'El pedido no tiene snapshots de impuestos por producto. Conserva el modo global para resolverlo.');
        $subtotals = CentAllocation::distribute(bcmul($subtotal, '100', 0), $items->map(fn ($item) => bcmul($item->line_subtotal, '10000', 0))->all());
        $discounts = CentAllocation::distribute(bcmul($discount, '100', 0), $subtotals);
        $rows = [];
        $base = '0.0000';
        $included = '0.0000';
        $additional = '0.0000';
        foreach ($items as $index => $item) {
            $amount = bcdiv($subtotals[$index], '100', 4);
            $allocatedDiscount = bcdiv($discounts[$index], '100', 4);
            $line = $this->line(bcsub($amount, $allocatedDiscount, 4), $item->tax_snapshot);
            $rows[] = ['order_item_id' => $item->id, 'product_name' => $item->product_name, 'variant_name' => $item->variant_name,
                'subtotal' => $amount, 'discount_amount' => $allocatedDiscount, ...$line];
            $base = Money::bounded(bcadd($base, $line['base'], 4));
            $included = Money::bounded(bcadd($included, $line['included_tax_amount'], 4));
            $additional = Money::bounded(bcadd($additional, $line['additional_tax_amount'], 4));
        }
        $tipLine = $tipProfile && bccomp($tip, '0', 4) > 0 ? $this->line($tip, $tipProfile) : null;
        if ($tipLine) {
            $base = Money::bounded(bcadd($base, $tipLine['base'], 4));
            $included = Money::bounded(bcadd($included, $tipLine['included_tax_amount'], 4));
            $additional = Money::bounded(bcadd($additional, $tipLine['additional_tax_amount'], 4));
        }

        return ['base' => $base, 'tax' => Money::bounded(bcadd($included, $additional, 4)),
            'total' => Money::bounded(bcadd(bcadd(bcsub($subtotal, $discount, 4), $tip, 4), $additional, 4)),
            'breakdown' => ['items' => $rows, 'tip' => $tipLine, 'included_tax_amount' => $included, 'additional_tax_amount' => $additional]];
    }

    public function line(string $amount, array $profile): array
    {
        $rates = $profile['rates'];
        $base = $amount;
        $taxes = [];
        $tax = '0.0000';
        if ($profile['price_mode'] === 'inclusive') {
            $rateSum = array_reduce($rates, fn ($sum, $rate) => bcadd($sum, $rate['rate'], 4), '0.0000');
            $extracted = IncludedTax::extract($amount, $rateSum);
            $base = $extracted['base'];
            $parts = CentAllocation::distribute(bcmul($extracted['tax'], '100', 0), array_map(fn ($rate) => bcmul($rate['rate'], '10000', 0), $rates));
            foreach ($rates as $index => $rate) {
                $taxes[] = [...$rate, 'amount' => bcdiv($parts[$index], '100', 4)];
            }
            $tax = $extracted['tax'];
        } elseif ($profile['price_mode'] === 'exclusive') {
            foreach ($rates as $rate) {
                $value = SaleTotals::round(bcdiv(bcmul($amount, $rate['rate'], 18), '100', 18));
                $taxes[] = [...$rate, 'amount' => $value];
                $tax = Money::bounded(bcadd($tax, $value, 4));
            }
        }
        $additional = $profile['price_mode'] === 'exclusive' ? $tax : '0.0000';

        return ['profile' => $profile, 'amount' => $amount, 'base' => $base, 'taxes' => $taxes,
            'included_tax_amount' => $profile['price_mode'] === 'inclusive' ? $tax : '0.0000', 'additional_tax_amount' => $additional,
            'total' => Money::bounded(bcadd($amount, $additional, 4))];
    }
}
