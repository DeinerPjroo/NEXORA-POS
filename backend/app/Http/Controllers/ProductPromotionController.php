<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\SavePromotion;
use App\Http\Requests\ContextPriceFiltersRequest;
use App\Http\Requests\PromotionRequest;
use App\Http\Resources\PromotionResource;
use App\Models\Product;
use App\Models\ProductPromotion;

final class ProductPromotionController extends Controller
{
    public function index(ContextPriceFiltersRequest $request, Product $product)
    {
        $data = $request->validated();
        $query = $product->promotions()->with(['branch', 'variant'])->where('variant_id', $data['variant_id'] ?? null)
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'));

        return PromotionResource::collection($query->orderBy('priority')->orderBy('id')->paginate($data['per_page'] ?? 10))->additional(['product_revision' => $product->revision]);
    }

    public function store(PromotionRequest $request, Product $product, SavePromotion $service)
    {
        return (new PromotionResource($service->execute($request->user(), $product, $request->validated())->load(['branch', 'variant'])))->response()->setStatusCode(201);
    }

    public function update(PromotionRequest $request, Product $product, ProductPromotion $promotion, SavePromotion $service)
    {
        return new PromotionResource($service->execute($request->user(), $product, $request->validated(), $promotion)->load(['branch', 'variant']));
    }
}
