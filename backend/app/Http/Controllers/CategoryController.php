<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\CatalogSearch;
use App\Domains\Catalog\SaveCatalogRecord;
use App\Http\Requests\CatalogFiltersRequest;
use App\Http\Requests\CategoryRequest;
use App\Models\Category;
use Illuminate\Http\Resources\Json\JsonResource;

final class CategoryController extends Controller
{
    public function index(CatalogFiltersRequest $request)
    {
        $data = $request->validated();
        $query = Category::withCount('products')
            ->when($data['search'] ?? null, fn ($query, $search) => $query->whereRaw("name LIKE ? ESCAPE '!'", [CatalogSearch::pattern($search)]))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('is_active', $status === 'active'))
            ->orderBy('name')->orderBy('id');

        return JsonResource::collection($query->paginate($data['per_page'] ?? 20));
    }

    public function store(CategoryRequest $request, SaveCatalogRecord $service)
    {
        return response()->json($service->execute($request->validated(), $request->user(), new Category), 201);
    }

    public function update(CategoryRequest $request, Category $category, SaveCatalogRecord $service)
    {
        return $service->execute($request->validated(), $request->user(), $category);
    }
}
