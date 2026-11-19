<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ProductImageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->only('id', 'product_id', 'mime', 'position', 'is_active', 'created_at'),
            'image_url' => '/api/v1/products/'.$this->product_id.'/images/'.$this->id.'?version='.substr(hash('sha256', $this->path), 0, 16)];
    }
}
