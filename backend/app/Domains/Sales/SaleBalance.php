<?php

namespace App\Domains\Sales;

use App\Models\Sale;

final class SaleBalance
{
    public function amounts(Sale $sale): array
    {
        $paid = $sale->payments->reduce(fn ($sum, $payment) => bcadd($sum, $payment->amount, 4), '0.0000');
        $refunded = $sale->refunds->reduce(fn ($sum, $refund) => bcadd($sum, $refund->amount, 4), '0.0000');
        $unpaid = bcsub($sale->total, $paid, 4);

        return ['paid_amount' => $paid, 'refunded_amount' => $refunded,
            'balance_due' => $sale->status === 'refunded' ? '0.0000' : $unpaid,
            'cancelled_balance' => $sale->status === 'refunded' ? $unpaid : '0.0000'];
    }
}
