<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\CatalogSearch;
use App\Domains\Catalog\SaveCatalogRecord;
use App\Http\Requests\CatalogFiltersRequest;
use App\Http\Requests\CategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;

final class CategoryController extends Controller
{
    public function index(CatalogFiltersRequest $request)
    {
        $data = $request->validated();
        $query = Category::with('parent')->withCount(['products', 'children'])
            ->when($data['search'] ?? null, fn ($query, $search) => $query->whereRaw("name LIKE ? ESCAPE '!'", [CatalogSearch::pattern($search)]))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('is_active', $status === 'active'))
            ->when($data['parent_id'] ?? null, fn ($query, $id) => $query->where('parent_id', $id))
            ->when($data['level'] ?? null, fn ($query, $level) => $level === 'root' ? $query->whereNull('parent_id') : $query->whereNotNull('parent_id'))
            ->orderBy('name')->orderBy('id');

        return CategoryResource::collection($query->paginate($data['per_page'] ?? 20));
    }

    public function store(CategoryRequest $request, SaveCatalogRecord $service)
    {
        $category = $service->execute($request->validated(), $request->user(), new Category)->load('parent')->loadCount(['products', 'children']);

        return response()->json((new CategoryResource($category))->resolve($request), 201);
    }

    public function update(CategoryRequest $request, Category $category, SaveCatalogRecord $service)
    {
        $category = $service->execute($request->validated(), $request->user(), $category)->load('parent')->loadCount(['products', 'children']);

        return (new CategoryResource($category))->resolve($request);
    }
}
