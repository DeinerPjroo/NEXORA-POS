<?php

namespace App\Http\Resources;

use App\Domains\Sales\PaymentBalance;
use App\Domains\Sales\PaymentReviewState;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class PaymentHistoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only('id', 'sale_id', 'branch_id', 'account_id', 'cash_session_id', 'method', 'method_name', 'method_kind', 'provenance', 'reference', 'received_amount', 'change_amount', 'created_at'),
            ...app(PaymentBalance::class)->amounts($this->resource), 'refunds_count' => $this->refunds->count(),
            'currency' => $this->sale->currency, 'branch_name' => $this->sale->branch_name, 'account_label' => $this->account?->label,
            'sale_status' => $this->sale->status, 'sale_revision' => $this->sale->revision,
            'review_revision' => $this->latestReview?->version ?? 0, 'review_status' => app(PaymentReviewState::class)->status($this->resource),
            'latest_review' => $this->latestReview ? new PaymentReviewResource($this->latestReview) : null,
            'receipt_code' => 'V-'.str_pad((string) $this->sale->receipt_number, 6, '0', STR_PAD_LEFT)];
    }
}
