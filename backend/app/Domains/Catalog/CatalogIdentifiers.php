<?php

namespace App\Domains\Catalog;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Validation\ValidationException;

final class CatalogIdentifiers
{
    // Llamar manteniendo el bloqueo de empresa: productos y variantes comparten el espacio de códigos.
    public static function assertAvailable(string $sku, ?string $barcode, ?int $productId = null, ?int $variantId = null): void
    {
        foreach (['sku' => $sku, 'barcode' => $barcode] as $field => $value) {
            if ($value === null) {
                continue;
            }
            $product = Product::where($field, $value)->when($productId, fn ($q) => $q->where('id', '!=', $productId))->exists();
            $variant = ProductVariant::where($field, $value)->when($variantId, fn ($q) => $q->where('id', '!=', $variantId))->exists();
            if ($product || $variant) {
                throw ValidationException::withMessages([$field => 'Este código ya pertenece a un producto o variante de tu empresa.']);
            }
        }
    }
}
