<?php

namespace App\Domains\Sales;

use App\Models\Payment;

final class PaymentBalance
{
    public function amounts(Payment $payment): array
    {
        $returned = $payment->refunds->reduce(fn ($sum, $refund) => bcadd($sum, $refund->amount, 4), '0.0000');

        return ['applied_amount' => $payment->amount, 'refunded_amount' => $returned, 'net_paid_amount' => bcsub($payment->amount, $returned, 4)];
    }
}
