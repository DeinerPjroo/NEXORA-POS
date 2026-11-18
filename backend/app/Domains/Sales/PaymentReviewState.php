<?php

namespace App\Domains\Sales;

use App\Models\Payment;
use Illuminate\Database\Eloquent\Builder;

final class PaymentReviewState
{
    public function status(Payment $payment): string
    {
        if ($payment->method_kind === 'cash') {
            return 'not_applicable';
        }
        $review = $payment->latestReview;
        if (! $review || $review->status === 'pending') {
            return 'pending';
        }

        return $review->sale_revision === $payment->sale->revision ? $review->status : 'stale';
    }

    public function filter(Builder $query, string $status): void
    {
        $query->where('method_kind', 'non_cash');
        if ($status === 'pending') {
            $query->where(fn ($q) => $q->whereDoesntHave('latestReview')->orWhereHas('latestReview', fn ($r) => $r->where('status', 'pending')));
        } else {
            $query->whereHas('latestReview', function ($review) use ($status) {
                $review->whereIn('status', $status === 'stale' ? ['matched', 'difference'] : [$status])
                    ->whereHas('sale', fn ($sale) => $sale->whereColumn('sales.revision', $status === 'stale' ? '<>' : '=', 'payment_reviews.sale_revision'));
            });
        }
    }
}
