<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\SaveModifierGroup;
use App\Domains\Catalog\SaveModifierOption;
use App\Http\Requests\CatalogFiltersRequest;
use App\Http\Requests\ModifierGroupRequest;
use App\Http\Requests\ModifierOptionRequest;
use App\Http\Resources\ModifierGroupResource;
use App\Http\Resources\ModifierOptionResource;
use App\Models\Product;
use App\Models\ProductModifierGroup;
use App\Models\ProductModifierOption;
use Illuminate\Support\Facades\Gate;

final class ProductModifierController extends Controller
{
    public function configuration(Product $product)
    {
        Gate::authorize('view', $product);
        $groups = $product->modifierGroups()->where('is_active', true)->with(['options' => fn ($q) => $q->where('is_active', true)->orderBy('position')->orderBy('id')])->orderBy('position')->orderBy('id')->get();

        return ModifierGroupResource::collection($groups)->additional(['product_revision' => $product->revision]);
    }

    public function groups(CatalogFiltersRequest $request, Product $product)
    {
        $data = $request->validated();
        $groups = $product->modifierGroups()->withCount(['options', 'options as active_options_count' => fn ($q) => $q->where('is_active', true)])
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'));

        return ModifierGroupResource::collection($groups->orderBy('position')->orderBy('id')->paginate($data['per_page'] ?? 10))->additional(['product_revision' => $product->revision]);
    }

    public function storeGroup(ModifierGroupRequest $request, Product $product, SaveModifierGroup $service)
    {
        return (new ModifierGroupResource($service->execute($request->user(), $product, $request->validated())))->response()->setStatusCode(201);
    }

    public function updateGroup(ModifierGroupRequest $request, Product $product, ProductModifierGroup $modifierGroup, SaveModifierGroup $service)
    {
        return new ModifierGroupResource($service->execute($request->user(), $product, $request->validated(), $modifierGroup));
    }

    public function options(CatalogFiltersRequest $request, Product $product, ProductModifierGroup $modifierGroup)
    {
        $data = $request->validated();
        $options = $modifierGroup->options()->when($data['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'));

        return ModifierOptionResource::collection($options->orderBy('position')->orderBy('id')->paginate($data['per_page'] ?? 10))->additional(['product_revision' => $product->revision, 'group_revision' => $modifierGroup->revision]);
    }

    public function storeOption(ModifierOptionRequest $request, Product $product, ProductModifierGroup $modifierGroup, SaveModifierOption $service)
    {
        return (new ModifierOptionResource($service->execute($request->user(), $product, $modifierGroup, $request->validated())))->response()->setStatusCode(201);
    }

    public function updateOption(ModifierOptionRequest $request, Product $product, ProductModifierGroup $modifierGroup, ProductModifierOption $option, SaveModifierOption $service)
    {
        return new ModifierOptionResource($service->execute($request->user(), $product, $modifierGroup, $request->validated(), $option));
    }
}
