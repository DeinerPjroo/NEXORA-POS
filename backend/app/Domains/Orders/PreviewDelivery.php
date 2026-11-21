<?php

namespace App\Domains\Orders;

use App\Domains\Sales\SaleTotals;
use App\Models\Order;
use App\Models\OrderDelivery;
use App\Models\OrderItem;
use App\Models\SalesSetting;
use App\Models\User;

final class PreviewDelivery
{
    public function calculate(User $actor, array $data): array
    {
        $cart = isset($data['items']) ? app(OrderPlan::class)->build($actor, [...$data, 'channel' => 'delivery']) : null;
        $subtotal = $cart['subtotal'] ?? $data['product_subtotal'];
        $fee = app(DeliveryFeePlan::class)->resolve($actor, (int) $data['branch_id'], $data['currency'], $subtotal, $data, false);
        $settings = SalesSetting::firstOrFail();
        $quote = null;
        if ($cart && $settings->configured) {
            // Preview models are never saved; use the same calculators and frozen catalog rows.
            $order = new Order(['currency' => $data['currency'], 'branch_id' => $data['branch_id'], 'channel' => 'delivery', 'subtotal' => $subtotal, 'status' => 'open']);
            $order->setRelation('items', collect($cart['items'])->map(fn ($row, $i) => (new OrderItem($row))->forceFill(['id' => $i + 1])));
            $order->setRelation('delivery', new OrderDelivery($fee));
            $quote = app(SaleTotals::class)->calculate($order, $settings, '0');
        }

        return [...$fee, 'product_subtotal' => $subtotal, 'quote' => $quote, 'sales_configured' => (bool) $settings->configured];
    }
}
