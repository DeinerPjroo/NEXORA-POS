<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class OrderComboResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return $this->resource->only('id', 'product_id', 'product_name', 'sku', 'quantity', 'unit_price', 'line_subtotal', 'notes', 'snapshot');
    }
}
