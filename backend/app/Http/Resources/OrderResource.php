<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        if ($this->resource->relationLoaded('items')) {
            $this->resource->loadMissing('items.preparationCorrections');
            $this->resource->loadMissing('itemChanges.item', 'itemChanges.replacement');
        }

        return [
            'id' => $this->id, 'public_id' => $this->public_id, 'branch_id' => $this->branch_id,
            'dining_session_id' => $this->dining_session_id, 'dining_snapshot' => $this->dining_snapshot,
            'branch_name' => $this->whenLoaded('branch', fn () => $this->branch->name),
            'channel' => $this->channel, 'reference' => $this->reference, 'customer_name' => $this->customer_name,
            'notes' => $this->notes, 'currency' => $this->currency, 'subtotal' => $this->subtotal,
            'status' => $this->status, 'revision' => $this->revision, 'created_at' => $this->created_at,
            'items_count' => $this->items_count ?? null,
            'sale_id' => $this->whenLoaded('sale', fn () => $this->sale?->id),
            'sale_status' => $this->whenLoaded('sale', fn () => $this->sale?->status),
            'delivery_fee_total' => $this->whenLoaded('delivery', fn () => $this->delivery?->fee_total ?? '0.0000'),
            'delivery_revision' => $this->whenLoaded('delivery', fn () => $this->delivery?->revision),
            'delivery_status' => $this->whenLoaded('delivery', fn () => $this->delivery?->status),
            'delivery_charge' => $this->whenLoaded('delivery', fn () => $this->delivery?->fee_snapshot),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => [...$item->only('id', 'product_id', 'variant_id', 'product_name', 'variant_name', 'sku', 'quantity', 'unit_price', 'line_subtotal', 'notes', 'tax_snapshot', 'base_unit_price', 'modifiers_snapshot', 'price_snapshot', 'availability_snapshot', 'order_combo_id', 'combo_position'), 'preparation_destination' => $item->destination($this->channel), 'preparation_corrections' => $item->preparationCorrections->map(fn ($c) => $c->only('id', 'from_destination', 'to_destination', 'reason', 'created_at'))])),
            'combos' => $this->whenLoaded('items', fn () => OrderComboResource::collection($this->combos->whereIn('id', $this->items->pluck('order_combo_id')->filter()))),
            'item_changes' => $this->whenLoaded('items', fn () => $this->itemChanges->map(fn ($change) => [...$change->only('id', 'order_item_id', 'replacement_item_id', 'reason', 'created_at'), 'product_name' => $change->item->product_name, 'quantity' => $change->item->quantity, 'replacement_quantity' => $change->replacement?->quantity, 'replacement_notes' => $change->replacement?->notes])),
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($event) => $event->only('id', 'from_status', 'to_status', 'reason', 'created_at'))),
        ];
    }
}
