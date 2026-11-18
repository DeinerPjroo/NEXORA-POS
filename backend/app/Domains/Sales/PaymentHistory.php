<?php

namespace App\Domains\Sales;

use App\Domains\Catalog\CatalogSearch;
use App\Models\Payment;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class PaymentHistory
{
    public function page(User $actor, array $data): array
    {
        $query = Payment::with(['sale:id,tenant_id,branch_id,branch_name,receipt_number,currency,status,revision', 'account:id,tenant_id,label', 'refunds:id,tenant_id,payment_id,amount'])
            ->when($data['branch_id'] ?? null, fn ($q, $id) => $q->where('branch_id', $id))
            ->when($data['method_kind'] ?? null, fn ($q, $kind) => $q->where('method_kind', $kind))
            ->when($data['reference'] ?? null, fn ($q, $value) => $q->whereRaw("reference LIKE ? ESCAPE '!'", [CatalogSearch::pattern($value)]));
        // Los timestamps SQL siguen la zona de aplicación existente, no asumir UTC.
        $timezone = $actor->tenant->timezone;
        foreach (['from', 'to'] as $bound) {
            if (! empty($data[$bound])) {
                $date = CarbonImmutable::createFromFormat('!Y-m-d', $data[$bound], $timezone);
                $date = ($bound === 'to' ? $date->addDay() : $date)->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s');
                $query->where('created_at', $bound === 'to' ? '<' : '>=', $date);
            }
        }
        $page = $query->orderByDesc('created_at')->orderByDesc('id')->paginate($data['per_page'] ?? 20);

        return ['page' => $page, 'summary' => $this->summarize($page->getCollection()), 'timezone' => $timezone];
    }

    public function summarize(Collection $payments): array
    {
        $summary = [];
        foreach ($payments as $payment) {
            $currency = $payment->sale->currency;
            $summary[$currency] ??= ['currency' => $currency, 'count' => 0, 'applied_amount' => '0.0000', 'refunded_amount' => '0.0000', 'net_paid_amount' => '0.0000'];
            foreach (app(PaymentBalance::class)->amounts($payment) as $name => $amount) {
                $summary[$currency][$name] = bcadd($summary[$currency][$name], $amount, 4);
            }
            $summary[$currency]['count']++;
        }

        return array_values($summary);
    }
}
