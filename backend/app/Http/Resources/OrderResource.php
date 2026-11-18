<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'public_id' => $this->public_id, 'branch_id' => $this->branch_id,
            'branch_name' => $this->whenLoaded('branch', fn () => $this->branch->name),
            'channel' => $this->channel, 'reference' => $this->reference, 'customer_name' => $this->customer_name,
            'notes' => $this->notes, 'currency' => $this->currency, 'subtotal' => $this->subtotal,
            'status' => $this->status, 'revision' => $this->revision, 'created_at' => $this->created_at,
            'items_count' => $this->items_count ?? null,
            'sale_id' => $this->whenLoaded('sale', fn () => $this->sale?->id),
            'sale_status' => $this->whenLoaded('sale', fn () => $this->sale?->status),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => $item->only('id', 'product_id', 'variant_id', 'product_name', 'variant_name', 'sku', 'quantity', 'unit_price', 'line_subtotal', 'notes', 'tax_snapshot', 'base_unit_price', 'modifiers_snapshot', 'price_snapshot', 'availability_snapshot', 'order_combo_id', 'combo_position'))),
            'combos' => $this->whenLoaded('items', fn () => OrderComboResource::collection($this->combos)),
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($event) => $event->only('id', 'from_status', 'to_status', 'reason', 'created_at'))),
        ];
    }
}
