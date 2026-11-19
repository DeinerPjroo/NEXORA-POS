<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\CatalogEligibility;
use App\Domains\Catalog\CatalogPriceContext;
use App\Domains\Catalog\CatalogPricing;
use App\Domains\Catalog\CatalogSearch;
use App\Domains\Catalog\SaveCatalogRecord;
use App\Http\Requests\CatalogFiltersRequest;
use App\Http\Requests\ProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Gate;

final class ProductController extends Controller
{
    public function index(CatalogFiltersRequest $request)
    {
        $data = $request->validated();
        $query = Product::with('category.parent', 'taxProfile')->withCatalogCounts()
            ->when($data['kind'] ?? null, fn ($query, $kind) => $query->where('kind', $kind))
            ->when($data['search'] ?? null, function ($query, $search) {
                $pattern = CatalogSearch::pattern($search);
                $query->where(fn ($q) => $q->whereRaw("name LIKE ? ESCAPE '!'", [$pattern])->orWhereRaw("sku LIKE ? ESCAPE '!'", [$pattern])->orWhereRaw("barcode LIKE ? ESCAPE '!'", [$pattern]));
            })
            ->when($data['category_id'] ?? null, fn ($query, $id) => $query->where(fn ($q) => $q->where('category_id', $id)->orWhereHas('category', fn ($category) => $category->where('parent_id', $id))))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('is_active', $status === 'active'))
            ->when($data['availability'] ?? null, fn ($query, $availability) => $query->where('is_available', $availability === 'available'));

        $page = $query->orderBy('name')->orderBy('id')->paginate($data['per_page'] ?? 20);
        $instant = CarbonImmutable::now();
        $timezone = $request->user()->tenant()->value('timezone');
        app(CatalogEligibility::class)->decorate($page->getCollection(), $timezone, $instant);
        $context = app(CatalogPriceContext::class)->from($data);
        if ($context) {
            $resolver = app(CatalogPricing::class);
            $rules = $resolver->candidates($page->getCollection()->modelKeys(), [], $context['branch']->id, $context['channel'], $timezone, $instant);
            foreach ($page as $product) {
                $product->setAttribute('price_context', $product->variants_count ? null : $resolver->resolve($product, null, $context['branch'], $context['channel'], $rules));
            }
        }

        return ProductResource::collection($page);
    }

    public function show(Product $product)
    {
        Gate::authorize('view', $product);

        return new ProductResource($this->hydrate($product));
    }

    public function store(ProductRequest $request, SaveCatalogRecord $service)
    {
        $product = $service->execute($request->validated(), $request->user(), new Product);

        return (new ProductResource($this->hydrate($product)))->response()->setStatusCode(201);
    }

    public function update(ProductRequest $request, Product $product, SaveCatalogRecord $service)
    {
        $product = $service->execute($request->validated(), $request->user(), $product);

        return new ProductResource($this->hydrate($product));
    }

    private function hydrate(Product $product): Product
    {
        $product->load('category.parent', 'taxProfile')->loadCount(['variants', 'variants as available_variants_count' => fn ($q) => $q->where('is_active', true)->where('is_available', true), 'modifierGroups as modifier_groups_count' => fn ($q) => $q->where('is_active', true)]);
        app(CatalogEligibility::class)->decorate(new Collection([$product]), request()->user()->tenant()->value('timezone'));

        return $product;
    }
}
