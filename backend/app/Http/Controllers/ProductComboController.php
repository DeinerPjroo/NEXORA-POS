<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\CatalogEligibility;
use App\Domains\Catalog\CatalogPriceContext;
use App\Domains\Catalog\CatalogPriceResolver;
use App\Domains\Catalog\SaveCombo;
use App\Domains\Catalog\SaveComboGroup;
use App\Http\Requests\CatalogFiltersRequest;
use App\Http\Requests\ComboComponentRequest;
use App\Http\Requests\ComboGroupRequest;
use App\Http\Requests\ComboSettingsRequest;
use App\Http\Resources\ComboComponentResource;
use App\Http\Resources\ComboGroupResource;
use App\Models\Product;
use App\Models\ProductComboComponent;
use App\Models\ProductComboGroup;
use Illuminate\Database\Eloquent\Collection;

final class ProductComboController extends Controller
{
    public function index(CatalogFiltersRequest $request, Product $product)
    {
        abort_unless($product->kind === 'combo', 422, 'Este producto no es un combo.');
        $query = $product->comboComponents()->with(['componentProduct' => fn ($q) => $q->with('category.parent', 'taxProfile')->withCatalogCounts(), 'componentVariant'])
            ->when($request->validated('status'), fn ($q, $state) => $q->where('is_active', $state === 'active'));
        $page = $query->orderBy('position')->orderBy('id')->paginate($request->validated('per_page', 10));
        app(CatalogEligibility::class)->decorate(new Collection([$product]), $request->user()->tenant()->value('timezone'));

        return ComboComponentResource::collection($page)->additional(['product_revision' => $product->revision, 'allocation_mode' => $product->combo_allocation_mode, 'combo_context' => $product->getAttribute('combo_context'), 'groups' => ComboGroupResource::collection($product->comboGroups)]);
    }

    public function configuration(CatalogFiltersRequest $request, Product $product)
    {
        abort_unless($product->kind === 'combo', 422, 'Este producto no es un combo.');
        $context = app(CatalogPriceContext::class)->from($request->validated());
        abort_unless($context, 422, 'Elige sucursal y canal antes de configurar el combo.');
        app(CatalogEligibility::class)->decorate(new Collection([$product]), $request->user()->tenant()->value('timezone'));
        $components = $product->comboComponents;
        $resolver = app(CatalogPriceResolver::class);
        $rules = $resolver->candidates([$product->id, ...$components->pluck('component_product_id')->all()], $components->pluck('component_variant_id')->filter()->unique()->all(), $context['branch']->id, $context['channel']);
        foreach ($components as $component) {
            $price = $resolver->resolve($component->componentProduct, $component->componentVariant, $context['branch'], $context['channel'], $rules);
            ($component->componentVariant ?? $component->componentProduct)->setAttribute('price_context', $price);
        }

        return ComboComponentResource::collection($components)->additional(['product_revision' => $product->revision, 'allocation_mode' => $product->combo_allocation_mode,
            'groups' => ComboGroupResource::collection($product->comboGroups), 'selection_version' => $product->comboGroups->isEmpty() ? 1 : 2,
            'combo_context' => $product->getAttribute('combo_context'), 'price_context' => $resolver->resolve($product, null, $context['branch'], $context['channel'], $rules)]);
    }

    public function settings(ComboSettingsRequest $request, Product $product, SaveCombo $service)
    {
        $product = $service->settings($request->user(), $product, $request->validated());

        return ['data' => ['product_revision' => $product->revision, 'allocation_mode' => $product->combo_allocation_mode]];
    }

    public function groups(CatalogFiltersRequest $request, Product $product)
    {
        abort_unless($product->kind === 'combo', 422, 'Este producto no es un combo.');
        $query = $product->comboGroups()->when($request->validated('status'), fn ($q, $state) => $q->where('is_active', $state === 'active'));

        return ComboGroupResource::collection($query->orderBy('position')->orderBy('id')->paginate($request->validated('per_page', 10)))->additional(['product_revision' => $product->revision]);
    }

    public function storeGroup(ComboGroupRequest $request, Product $product, SaveComboGroup $service)
    {
        return (new ComboGroupResource($service->execute($request->user(), $product, $request->validated())))->response()->setStatusCode(201);
    }

    public function updateGroup(ComboGroupRequest $request, Product $product, ProductComboGroup $comboGroup, SaveComboGroup $service)
    {
        return new ComboGroupResource($service->execute($request->user(), $product, $request->validated(), $comboGroup));
    }

    public function store(ComboComponentRequest $request, Product $product, SaveCombo $service)
    {
        return (new ComboComponentResource($service->component($request->user(), $product, $request->validated())))->response()->setStatusCode(201);
    }

    public function update(ComboComponentRequest $request, Product $product, ProductComboComponent $comboComponent, SaveCombo $service)
    {
        return new ComboComponentResource($service->component($request->user(), $product, $request->validated(), $comboComponent));
    }
}
