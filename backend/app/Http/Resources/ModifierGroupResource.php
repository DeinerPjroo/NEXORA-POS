<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ModifierGroupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only('id', 'product_id', 'name', 'kind', 'min_select', 'max_select', 'is_active', 'position', 'revision'),
            'options_count' => $this->whenCounted('options'), 'active_options_count' => $this->whenCounted('active_options'),
            'options' => ModifierOptionResource::collection($this->whenLoaded('options'))];
    }
}
