<?php

namespace App\Domains\Catalog;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;

final class ModifierProductContext
{
    // Llamar dentro de IdempotentOperation, que ya bloqueó la empresa.
    public function lock(User $actor, Product $product, array $data): Product
    {
        $product = Product::whereKey($product->id)->lockForUpdate()->firstOrFail();
        $currency = Tenant::whereKey($actor->tenant_id)->value('currency');
        abort_unless($currency === $data['currency'], 409, 'La moneda cambió. Revisa la configuración antes de guardar.');
        abort_unless($product->revision === (int) $data['product_revision'], 409, 'El producto cambió. Actualiza su ficha antes de guardar modificadores.');

        return $product;
    }
}
