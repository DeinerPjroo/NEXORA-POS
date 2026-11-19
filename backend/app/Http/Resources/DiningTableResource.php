<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DiningTableResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->only(['id', 'branch_id', 'dining_room_id', 'name', 'shape', 'color', 'capacity', 'x', 'y', 'width', 'height', 'rotation', 'is_active', 'revision']);
    }
}
