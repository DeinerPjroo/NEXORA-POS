<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\ProductGallery;
use App\Http\Requests\CatalogFiltersRequest;
use App\Http\Requests\GalleryCommandRequest;
use App\Http\Requests\GalleryUploadRequest;
use App\Http\Resources\ProductImageResource;
use App\Models\Product;
use App\Models\ProductImage;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

final class ProductGalleryController extends Controller
{
    public function index(CatalogFiltersRequest $request, Product $product)
    {
        return ProductImageResource::collection($product->productImages()->where('is_active', true)->orderBy('position')->orderBy('id')->paginate($request->validated('per_page', 8)))
            ->additional(['product_revision' => $product->revision, 'cover_image_id' => $product->cover_image_id, 'limit' => 8]);
    }

    public function show(Product $product, ProductImage $productImage)
    {
        Gate::authorize('view', $product);
        abort_unless($productImage->is_active && Storage::disk('catalog')->exists($productImage->path), 404);

        return Storage::disk('catalog')->response($productImage->path, null, ['Content-Type' => $productImage->mime, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff'], 'inline');
    }

    public function store(GalleryUploadRequest $request, Product $product, ProductGallery $service)
    {
        return (new ProductImageResource($service->upload($request->user(), $product, $request->validated(), $request->file('image'))))->response()->setStatusCode(201);
    }

    public function order(GalleryCommandRequest $request, Product $product, ProductGallery $service)
    {
        return $this->metadata($service->change($request->user(), $product, $request->validated(), 'order'));
    }

    public function cover(GalleryCommandRequest $request, Product $product, ProductImage $productImage, ProductGallery $service)
    {
        return $this->metadata($service->change($request->user(), $product, $request->validated(), 'cover', $productImage));
    }

    public function destroy(GalleryCommandRequest $request, Product $product, ProductImage $productImage, ProductGallery $service)
    {
        return $this->metadata($service->change($request->user(), $product, $request->validated(), 'remove', $productImage));
    }

    private function metadata(Product $product): array
    {
        return ['data' => ['product_revision' => $product->revision, 'cover_image_id' => $product->cover_image_id]];
    }
}
