<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

final class ProductGallery
{
    public function upload(User $actor, Product $product, array $data, UploadedFile $file): ProductImage
    {
        Gate::authorize('update', $product);
        unset($data['image']);
        $data['file_hash'] = hash_file('sha256', $file->getRealPath());
        $path = null;
        try {
            return app(IdempotentOperation::class)->run($actor, 'catalog.gallery.upload.'.$product->id, $data, ProductImage::class, function ($data) use ($actor, $product, $file, &$path) {
                $product = app(ModifierProductContext::class)->lock($actor, $product, $data, 'la galería');
                abort_if($product->productImages()->where('is_active', true)->count() >= 8, 422, 'Un producto admite hasta ocho fotografías activas.');
                $image = $this->write($actor, $product, $file, $path);
                $this->saveCover($product, ($data['make_cover'] ?? false) || ! $product->cover_image_id ? $image : $this->cover($product));
                Audit::record('catalog.gallery.uploaded', 'Se agregó una fotografía privada al producto.', $actor, ['product_id' => $product->id, 'image_id' => $image->id, 'product_revision' => $product->revision]);

                return $image;
            });
        } catch (Throwable $error) {
            $this->cleanupUnreferenced($path);
            throw $error;
        }
    }

    public function change(User $actor, Product $product, array $data, string $action, ?ProductImage $image = null): Product
    {
        Gate::authorize('update', $product);
        abort_unless(in_array($action, ['cover', 'remove', 'order'], true), 422);

        return app(IdempotentOperation::class)->run($actor, 'catalog.gallery.'.$action.'.'.$product->id.'.'.($image?->id ?? 0), $data, Product::class, function ($data) use ($actor, $product, $action, $image) {
            $product = app(ModifierProductContext::class)->lock($actor, $product, $data, 'la galería');
            $images = $product->productImages()->where('is_active', true)->orderBy('position')->orderBy('id')->lockForUpdate()->get();
            $selected = $image ? $images->firstWhere('id', $image->id) : null;
            abort_if($image && ! $selected, 409, 'La fotografía ya fue retirada. Actualiza la galería.');
            $cover = $this->cover($product);
            if ($action === 'order') {
                $ids = array_map('intval', $data['image_ids']);
                abort_unless(count($ids) === $images->count() && count(array_unique($ids)) === count($ids) && $images->pluck('id')->diff($ids)->isEmpty(), 409, 'El orden debe incluir todas las fotografías activas una sola vez.');
                $images = collect($ids)->map(fn ($id) => $images->firstWhere('id', $id));
            } elseif ($action === 'remove') {
                $selected->is_active = false;
                $selected->save();
                $images = $images->where('id', '!=', $selected->id)->values();
                if ((int) $product->cover_image_id === $selected->id) {
                    $cover = $images->first();
                }
                DB::afterCommit(fn () => $this->cleanup($selected->path));
            } else {
                $cover = $selected;
            }
            foreach ($images->values() as $position => $part) {
                $part->position = $position;
                $part->save();
            }
            $this->saveCover($product, $cover);
            Audit::record('catalog.gallery.'.$action, 'Se actualizó la galería privada del producto.', $actor, ['product_id' => $product->id, 'image_id' => $selected?->id, 'product_revision' => $product->revision]);

            return $product;
        });
    }

    // Compatibilidad del endpoint de fotografía anterior; conserva las demás imágenes.
    public function legacy(Product $product, User $actor, int $revision, ?UploadedFile $file): Product
    {
        Gate::authorize('update', $product);
        $path = null;
        try {
            return DB::transaction(function () use ($product, $actor, $revision, $file, &$path) {
                Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
                $product = Product::whereKey($product->id)->lockForUpdate()->firstOrFail();
                abort_if($product->revision !== $revision, 409, 'El producto cambió. Actualiza la ficha antes de cambiar la imagen.');
                $old = $this->cover($product);
                if ($old) {
                    $old->is_active = false;
                    $old->save();
                    DB::afterCommit(fn () => $this->cleanup($old->path));
                }
                $image = $file ? $this->write($actor, $product, $file, $path) : $product->productImages()->where('is_active', true)->orderBy('position')->orderBy('id')->first();
                $this->saveCover($product, $image);
                Audit::record('catalog.image.'.($file ? 'saved' : 'removed'), $file ? 'Se actualizó la fotografía del producto.' : 'Se retiró la fotografía del producto.', $actor, ['product_id' => $product->id, 'revision' => $product->revision]);

                return $product;
            });
        } catch (Throwable $error) {
            $this->cleanupUnreferenced($path);
            throw $error;
        }
    }

    private function write(User $actor, Product $product, UploadedFile $file, ?string &$path): ProductImage
    {
        abort_if($product->productImages()->where('is_active', true)->count() >= 8, 422, 'Un producto admite hasta ocho fotografías activas.');
        $encoded = app(SanitizeProductImage::class)->encode($file);
        $path = 'tenants/'.$actor->tenant_id.'/products/'.$product->id.'/'.Str::uuid().'.'.$encoded['extension'];
        abort_unless(Storage::disk('catalog')->put($path, $encoded['bytes']), 500, 'No se pudo guardar la fotografía.');
        $image = new ProductImage;
        $image->product_id = $product->id;
        $image->path = $path;
        $image->mime = $encoded['mime'];
        $image->position = (int) ($product->productImages()->where('is_active', true)->max('position') ?? -1) + 1;
        $image->is_active = true;
        $image->save();

        return $image;
    }

    private function cover(Product $product): ?ProductImage
    {
        return $product->cover_image_id ? $product->productImages()->where('is_active', true)->find($product->cover_image_id) : null;
    }

    private function saveCover(Product $product, ?ProductImage $image): void
    {
        $product->cover_image_id = $image?->id;
        $product->image_path = $image?->path;
        $product->image_mime = $image?->mime;
        $product->revision++;
        $product->save();
    }

    private function cleanupUnreferenced(?string $path): void
    {
        if (! $path) {
            return;
        }
        try {
            if (! ProductImage::where('path', $path)->exists()) {
                $this->cleanup($path);
            }
        } catch (Throwable) {
            Log::warning('No se pudo comprobar la referencia de una fotografía; se conserva el archivo para revisión.');
        }
    }

    private function cleanup(string $path): void
    {
        try {
            Storage::disk('catalog')->delete($path);
        } catch (Throwable) {
            Log::warning('No se pudo limpiar una fotografía retirada del catálogo.', ['path' => $path]);
        }
    }
}
