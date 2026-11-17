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
            'net_paid_amount' => bcsub($paid, $refunded, 4),
            'effective_total' => bcsub($sale->status === 'refunded' ? $paid : $sale->total, $refunded, 4),
            'balance_due' => $sale->status === 'refunded' ? '0.0000' : $unpaid,
            'cancelled_balance' => $sale->status === 'refunded' ? $unpaid : '0.0000'];
    }

    public function refundedByPayment(Sale $sale): array
    {
        $amounts = [];
        foreach ($sale->refunds as $refund) {
            $amounts[$refund->payment_id] = bcadd($amounts[$refund->payment_id] ?? '0.0000', $refund->amount, 4);
        }

        return $amounts;
    }
}
