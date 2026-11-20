<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class KitchenTicketResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $this->resource->loadMissing('lines.preparationCorrections');

        return [...$this->resource->only(['id', 'branch_id', 'order_id', 'kitchen_dispatch_id', 'kitchen_station_id', 'station_name', 'station_color', 'target_minutes', 'order_snapshot', 'status', 'revision', 'created_at', 'started_at', 'ready_at', 'delivered_at']),
            'lines' => $this->lines->map(fn ($line) => ['id' => $line->id, 'order_item_id' => $line->order_item_id, ...$line->snapshot, 'preparation_destination' => $line->preparationCorrections->last()?->to_destination ?? $line->snapshot['preparation_destination'] ?? (($this->order_snapshot['channel'] ?? '') === 'dine_in' ? 'table' : 'takeaway'), 'corrections' => $line->preparationCorrections->map(fn ($c) => $c->only('id', 'from_destination', 'to_destination', 'reason', 'created_at'))]),
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($event) => $event->only('id', 'from_status', 'to_status', 'reason', 'created_at')))];
    }
}
