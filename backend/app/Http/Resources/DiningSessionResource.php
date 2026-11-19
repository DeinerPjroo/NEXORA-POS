<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DiningSessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $orders = $request->user()->can('orders.view');

        return [...$this->resource->only(['id', 'branch_id', 'status', 'guest_count', 'waiter_id', 'notes', 'revision', 'opened_at', 'closed_at']),
            'waiter_name' => $this->waiter?->name,
            'tables' => $this->whenLoaded('memberships', fn () => $this->memberships->map(fn ($m) => [...$m->only(['dining_table_id', 'table_name', 'joined_at', 'released_at']), 'table_revision' => $m->table?->revision, 'capacity' => $m->table?->capacity])),
            'orders_count' => $this->orders_count ?? null,
            'orders' => $this->when($orders && $this->resource->relationLoaded('orders'), fn () => $this->orders->map(fn ($o) => ['id' => $o->id, 'revision' => $o->revision, 'status' => $o->status, 'sale_id' => $o->sale?->id])),
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($e) => ['id' => $e->id, 'action' => $e->action, 'created_at' => $e->created_at, 'details' => ! $orders && str_starts_with($e->action, 'order.') ? [] : $e->details])),
        ];
    }
}
