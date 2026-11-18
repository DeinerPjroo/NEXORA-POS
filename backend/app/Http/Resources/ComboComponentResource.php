<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ComboComponentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only('id', 'product_id', 'component_product_id', 'component_variant_id', 'units', 'position', 'is_active', 'revision'),
            'product' => $this->whenLoaded('componentProduct', fn () => new ProductResource($this->componentProduct)),
            'variant' => $this->whenLoaded('componentVariant', fn () => $this->componentVariant ? new VariantResource($this->componentVariant) : null)];
    }
}
