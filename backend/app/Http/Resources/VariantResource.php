<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class VariantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'product_id' => $this->product_id, 'name' => $this->name,
            'sku' => $this->sku, 'barcode' => $this->barcode, 'sale_price' => $this->sale_price,
            'price_context' => $this->when(array_key_exists('price_context', $this->resource->getAttributes()), fn () => $this->resource->getAttribute('price_context')),
            'cost_price' => $this->when($request->user()->hasPermission('catalog.costs'), fn () => $this->cost_price),
            'is_active' => $this->is_active, 'is_available' => $this->is_available,
        ];
    }
}
