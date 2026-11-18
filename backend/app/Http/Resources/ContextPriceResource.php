<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ContextPriceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only('id', 'product_id', 'variant_id', 'branch_id', 'channel', 'amount', 'is_active', 'revision'),
            'branch' => $this->whenLoaded('branch', fn () => $this->branch?->only('id', 'name', 'is_active')),
            'variant' => $this->whenLoaded('variant', fn () => $this->variant?->only('id', 'name', 'is_active', 'is_available'))];
    }
}
