<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\SaveContextPrice;
use App\Http\Requests\ContextPriceFiltersRequest;
use App\Http\Requests\ContextPriceRequest;
use App\Http\Resources\ContextPriceResource;
use App\Models\Product;
use App\Models\ProductContextPrice;

final class ContextPriceController extends Controller
{
    public function index(ContextPriceFiltersRequest $request, Product $product)
    {
        $data = $request->validated();
        $query = $product->contextPrices()->with(['branch', 'variant'])->where('variant_scope', $data['variant_id'] ?? 0)
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'));

        return ContextPriceResource::collection($query->orderByDesc('id')->paginate($data['per_page'] ?? 10))->additional(['product_revision' => $product->revision]);
    }

    public function store(ContextPriceRequest $request, Product $product, SaveContextPrice $service)
    {
        return (new ContextPriceResource($service->execute($request->user(), $product, $request->validated())->load(['branch', 'variant'])))->response()->setStatusCode(201);
    }

    public function update(ContextPriceRequest $request, Product $product, ProductContextPrice $contextPrice, SaveContextPrice $service)
    {
        return new ContextPriceResource($service->execute($request->user(), $product, $request->validated(), $contextPrice)->load(['branch', 'variant']));
    }
}
