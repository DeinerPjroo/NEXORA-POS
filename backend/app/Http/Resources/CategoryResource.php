<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [...$this->resource->summary(), 'description' => $this->description,
            'products_count' => $this->whenCounted('products'), 'children_count' => $this->whenCounted('children')];
    }
}
