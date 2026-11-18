<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaveVariant
{
    public function execute(array $data, User $actor, Product $product, ?ProductVariant $variant = null): ProductVariant
    {
        return DB::transaction(function () use ($data, $actor, $product, $variant) {
            $company = Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
            $product = Product::whereKey($product->id)->lockForUpdate()->firstOrFail();
            Gate::authorize('update', $product);
            abort_if($product->kind === 'combo', 422, 'Configura las presentaciones desde los componentes del combo.');
            abort_if($company->currency !== $data['currency'], 409, 'La moneda cambió. Recarga el espacio antes de guardar precios.');
            abort_if($product->revision !== (int) $data['product_revision'], 409, 'El producto cambió en otra sesión. Actualiza la ficha antes de guardar.');
            if ($variant) {
                $variant = $product->variants()->lockForUpdate()->findOrFail($variant->id);
            }
            CatalogIdentifiers::assertAvailable($data['sku'], $data['barcode'] ?? $variant?->barcode, null, $variant?->id);
            $duplicate = $product->variants()->where('name', $data['name'])->when($variant, fn ($q) => $q->where('id', '!=', $variant->id))->exists();
            if ($duplicate) {
                throw ValidationException::withMessages(['name' => 'Este producto ya tiene una variante con ese nombre.']);
            }
            unset($data['currency'], $data['product_revision']);
            $existing = $variant !== null;
            $variant ??= new ProductVariant;
            $variant->product_id = $product->id;
            $variant->fill($data)->save();
            $product->revision++;
            $product->save();
            Audit::record('catalog.variant.'.($existing ? 'updated' : 'created'), 'Se guardó la variante «'.$variant->name.'».', $actor, ['product_id' => $product->id, 'variant_id' => $variant->id, 'revision' => $product->revision]);

            return $variant->refresh();
        });
    }
}
