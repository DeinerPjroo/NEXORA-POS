<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ModifierOptionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->only('id', 'product_id', 'modifier_group_id', 'name', 'extra_price', 'is_active', 'position');
    }
}
