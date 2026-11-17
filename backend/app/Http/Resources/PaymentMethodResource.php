<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class PaymentMethodResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only('id', 'code', 'name', 'kind', 'is_active', 'is_system', 'revision'), 'provenance' => 'operator'];
    }
}
