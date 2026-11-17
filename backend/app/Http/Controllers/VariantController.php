<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\CatalogSearch;
use App\Domains\Catalog\SaveVariant;
use App\Http\Requests\CatalogFiltersRequest;
use App\Http\Requests\VariantRequest;
use App\Http\Resources\VariantResource;
use App\Models\Product;
use App\Models\ProductVariant;

final class VariantController extends Controller
{
    public function index(CatalogFiltersRequest $request, Product $product)
    {
        $data = $request->validated();
        $query = $product->variants()
            ->when($data['search'] ?? null, function ($q, $search) {
                $pattern = CatalogSearch::pattern($search);
                $q->where(fn ($nested) => $nested->whereRaw("name LIKE ? ESCAPE '!'", [$pattern])->orWhereRaw("sku LIKE ? ESCAPE '!'", [$pattern])->orWhereRaw("barcode LIKE ? ESCAPE '!'", [$pattern]));
            })
            ->when($data['status'] ?? null, fn ($q, $state) => $q->where('is_active', $state === 'active'))
            ->when($data['availability'] ?? null, fn ($q, $state) => $q->where('is_available', $state === 'available'));

        return VariantResource::collection($query->orderBy('name')->orderBy('id')->paginate($data['per_page'] ?? 20))
            ->additional(['product_revision' => $product->revision]);
    }

    public function store(VariantRequest $request, Product $product, SaveVariant $service)
    {
        return (new VariantResource($service->execute($request->validated(), $request->user(), $product)))->response()->setStatusCode(201);
    }

    public function update(VariantRequest $request, Product $product, ProductVariant $variant, SaveVariant $service)
    {
        return new VariantResource($service->execute($request->validated(), $request->user(), $product, $variant));
    }
}
