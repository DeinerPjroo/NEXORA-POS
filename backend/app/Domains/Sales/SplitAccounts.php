<?php

namespace App\Domains\Sales;

use App\Models\Sale;
use App\Models\SaleAccount;
use Illuminate\Validation\ValidationException;

final class SplitAccounts
{
    public function plan(string $total, int $count): array
    {
        if ($count < 2 || $count > 20) {
            throw ValidationException::withMessages(['split_count' => 'Divide entre 2 y 20 cuentas.']);
        }
        $cents = bcmul($total, '100', 0);
        $base = bcdiv($cents, (string) $count, 0);
        if (bccomp($base, '0', 0) <= 0) {
            throw ValidationException::withMessages(['split_count' => 'Cada cuenta debe tener al menos un centavo. Reduce el número de partes.']);
        }
        $remainder = (int) bcmod($cents, (string) $count, 0);
        $parts = [];
        for ($number = 1; $number <= $count; $number++) {
            $parts[] = ['number' => $number, 'label' => 'Cuenta '.$number, 'amount' => bcdiv(bcadd($base, $number <= $remainder ? '1' : '0', 0), '100', 4)];
        }

        return $parts;
    }

    // Antes del primer pago, dentro de CollectCash: ninguna API reasigna ventas previas.
    public function create(Sale $sale, int $count): void
    {
        foreach ($this->plan($sale->total, $count) as $part) {
            SaleAccount::create([...$part, 'sale_id' => $sale->id, 'created_at' => now()]);
        }
    }

    public function balances(Sale $sale): array
    {
        $paid = [];
        $returned = [];
        $paymentAccounts = [];
        foreach ($sale->payments as $payment) {
            if ($payment->account_id !== null) {
                $paid[$payment->account_id] = bcadd($paid[$payment->account_id] ?? '0.0000', $payment->amount, 4);
                $paymentAccounts[$payment->id] = $payment->account_id;
            }
        }
        foreach ($sale->refunds as $refund) {
            $accountId = $paymentAccounts[$refund->payment_id] ?? null;
            if ($accountId !== null) {
                $returned[$accountId] = bcadd($returned[$accountId] ?? '0.0000', $refund->amount, 4);
            }
        }

        return $sale->accounts->map(function ($account) use ($sale, $paid, $returned) {
            $applied = $paid[$account->id] ?? '0.0000';
            $refunded = $returned[$account->id] ?? '0.0000';
            $unpaid = bcsub($account->amount, $applied, 4);

            return [...$account->only('id', 'number', 'label', 'amount'), 'paid_amount' => $applied, 'refunded_amount' => $refunded,
                'net_paid_amount' => bcsub($applied, $refunded, 4), 'balance_due' => $sale->status === 'refunded' ? '0.0000' : $unpaid,
                'cancelled_balance' => $sale->status === 'refunded' ? $unpaid : '0.0000',
                'effective_total' => bcsub($sale->status === 'refunded' ? $applied : $account->amount, $refunded, 4)];
        })->all();
    }
}
