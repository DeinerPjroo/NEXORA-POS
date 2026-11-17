<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

final class SaveProductImage
{
    public function execute(Product $product, User $actor, int $revision, ?UploadedFile $file): Product
    {
        $path = null;
        $mime = null;
        if ($file) {
            $encoded = app(SanitizeProductImage::class)->encode($file);
            $path = 'tenants/'.$actor->tenant_id.'/products/'.$product->id.'/'.Str::uuid().'.'.$encoded['extension'];
            $mime = $encoded['mime'];
        }
        try {
            if ($path) {
                Storage::disk('catalog')->put($path, $encoded['bytes']);
            }

            return DB::transaction(function () use ($product, $actor, $revision, $path, $mime) {
                $product = Product::whereKey($product->id)->lockForUpdate()->firstOrFail();
                abort_if($product->revision !== $revision, 409, 'El producto cambió. Actualiza la ficha antes de cambiar la imagen.');
                $oldPath = $product->image_path;
                $product->image_path = $path;
                $product->image_mime = $mime;
                $product->revision++;
                $product->save();
                Audit::record('catalog.image.'.($path ? 'saved' : 'removed'), $path ? 'Se actualizó la fotografía del producto.' : 'Se retiró la fotografía del producto.', $actor, ['product_id' => $product->id, 'revision' => $product->revision]);
                if ($oldPath) {
                    DB::afterCommit(fn () => $this->cleanup($oldPath));
                }

                return $product;
            });
        } catch (Throwable $error) {
            if ($path) {
                $this->cleanup($path);
            }
            throw $error;
        }
    }

    private function cleanup(string $path): void
    {
        try {
            Storage::disk('catalog')->delete($path);
        } catch (Throwable) {
            Log::warning('No se pudo limpiar una imagen anterior del catálogo.', ['path' => $path]);
        }
    }
}
