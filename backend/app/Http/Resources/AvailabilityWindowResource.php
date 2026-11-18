<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class AvailabilityWindowResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->only('id', 'product_id', 'name', 'weekday', 'start_time', 'end_time', 'ends_next_day', 'valid_from', 'valid_until', 'is_active', 'revision');
    }
}
