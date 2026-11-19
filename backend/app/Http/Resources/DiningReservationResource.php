<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DiningReservationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only(['id', 'branch_id', 'guest_name', 'phone', 'guest_count', 'notes', 'status', 'booking_timezone', 'starts_at', 'ends_at', 'revision', 'dining_session_id']),
            'branch_name' => $this->whenLoaded('branch', fn () => $this->branch->name),
            'tables' => $this->whenLoaded('tables', fn () => $this->tables->map(fn ($t) => [...$t->only(['dining_table_id', 'table_name']), 'table_revision' => $t->table?->revision, 'capacity' => $t->table?->capacity]))];
    }
}
