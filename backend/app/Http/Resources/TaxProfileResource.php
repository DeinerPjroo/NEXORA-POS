<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class TaxProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->only('id', 'name', 'price_mode', 'rates', 'is_active', 'revision');
    }
}
