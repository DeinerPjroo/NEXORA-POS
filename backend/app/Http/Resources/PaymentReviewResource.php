<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class PaymentReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->only('id', 'payment_id', 'version', 'sale_revision', 'currency', 'status', 'expected_net_amount', 'observed_amount', 'difference_amount', 'reference', 'notes', 'actor_name', 'review_confirmed', 'provenance', 'created_at');
    }
}
