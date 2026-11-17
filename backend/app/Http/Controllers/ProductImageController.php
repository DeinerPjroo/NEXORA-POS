<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\SaveProductImage;
use App\Http\Requests\ProductImageRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

final class ProductImageController extends Controller
{
    public function show(Product $product)
    {
        Gate::authorize('view', $product);
        abort_unless($product->image_path && Storage::disk('catalog')->exists($product->image_path), 404);

        return Storage::disk('catalog')->response($product->image_path, null, ['Content-Type' => $product->image_mime, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff'], 'inline');
    }

    public function store(ProductImageRequest $request, Product $product, SaveProductImage $service)
    {
        $product = $service->execute($product, $request->user(), $request->integer('revision'), $request->file('image'));

        return new ProductResource($product->load('category')->loadCount(['variants', 'variants as available_variants_count' => fn ($q) => $q->where('is_active', true)->where('is_available', true)]));
    }

    public function destroy(ProductImageRequest $request, Product $product, SaveProductImage $service)
    {
        return $this->store($request, $product, $service);
    }
}
