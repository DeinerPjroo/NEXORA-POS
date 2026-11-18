<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'sku' => $this->sku,
            'barcode' => $this->barcode, 'description' => $this->description,
            'category_id' => $this->category_id,
            'tax_profile' => $this->whenLoaded('taxProfile', fn () => $this->taxProfile?->only('id', 'name', 'price_mode', 'rates', 'is_active', 'revision')),
            'category' => $this->whenLoaded('category', fn () => $this->category->summary()),
            'sale_price' => $this->sale_price,
            'price_context' => $this->when(array_key_exists('price_context', $this->resource->getAttributes()), fn () => $this->resource->getAttribute('price_context')),
            'cost_price' => $this->when($request->user()->hasPermission('catalog.costs'), fn () => $this->cost_price),
            'is_active' => $this->is_active, 'is_available' => $this->is_available,
            'availability_schedule_enabled' => $this->availability_schedule_enabled,
            'availability_context' => $this->when(array_key_exists('availability_context', $this->resource->getAttributes()), fn () => $this->resource->getAttribute('availability_context')),
            'sellable' => $this->is_active && $this->is_available && (bool) $this->category?->isEffectivelyActive() && (! $this->tax_profile_id || $this->taxProfile?->is_active) && (! $this->variants_count || $this->available_variants_count > 0) && ($this->resource->getAttribute('availability_context')['allowed'] ?? true),
            'variants_count' => $this->variants_count ?? 0,
            'modifier_groups_count' => $this->modifier_groups_count ?? 0,
            'available_variants_count' => $this->available_variants_count ?? 0,
            'image_url' => $this->image_path ? '/api/v1/products/'.$this->id.'/image?version='.substr(hash('sha256', $this->image_path), 0, 16) : null,
            'revision' => $this->revision, 'updated_at' => $this->updated_at,
        ];
    }
}
