<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DiningRoomResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only(['id', 'branch_id', 'name', 'color', 'is_active', 'revision', 'layout_schema_version']),
            'branch' => $this->branch?->only(['id', 'name', 'is_active']),
            'objects' => $this->objects ?? [],
            'tables' => DiningTableResource::collection($this->whenLoaded('diningTables')),
        ];
    }
}
