<?php

namespace App\Http\Resources;

use App\Domains\Kitchen\KitchenDisplay;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class KitchenStationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only(['id', 'branch_id', 'name', 'color', 'target_minutes', 'is_active', 'revision']),
            'display_settings' => $this->display_settings ?? KitchenDisplay::defaults(),
            'branch' => $this->branch->only(['id', 'name', 'is_active'])];
    }
}
