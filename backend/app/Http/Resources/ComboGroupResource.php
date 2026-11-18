<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ComboGroupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->only('id', 'product_id', 'name', 'min_select', 'max_select', 'position', 'is_active', 'revision');
    }
}
