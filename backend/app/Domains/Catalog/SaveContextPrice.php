<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Product;
use App\Models\ProductContextPrice;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaveContextPrice
{
    public function execute(User $actor, Product $product, array $data, ?ProductContextPrice $price = null): ProductContextPrice
    {
        Gate::authorize('update', $product);
        $action = $price ? 'catalog.context-price.update.'.$price->id : 'catalog.context-price.create.'.$product->id;

        return app(IdempotentOperation::class)->run($actor, $action, $data, ProductContextPrice::class, function ($data) use ($actor, $product, $price) {
            $product = app(ModifierProductContext::class)->lock($actor, $product, $data, 'precios');
            $existing = $price !== null;
            $price = $existing ? $product->contextPrices()->lockForUpdate()->findOrFail($price->id) : new ProductContextPrice;
            if ($existing) {
                abort_unless($price->revision === (int) $data['revision'], 409, 'El precio de este contexto cambió. Actualiza los datos.');
                $price->revision++;
            } else {
                if (empty($data['branch_id']) && $data['channel'] === 'all') {
                    throw ValidationException::withMessages(['channel' => 'Elige una sucursal o canal específico. El precio general se edita en el producto o presentación.']);
                }
                $variantId = $data['variant_id'] ?? null;
                if ($variantId) {
                    $product->variants()->whereKey($variantId)->firstOrFail();
                }
                if ($product->contextPrices()->where('variant_scope', $variantId ?? 0)->where('branch_scope', $data['branch_id'] ?? 0)->where('channel', $data['channel'])->exists()) {
                    throw ValidationException::withMessages(['channel' => 'Este contexto ya tiene un precio conservado. Edita o reactiva ese registro.']);
                }
                $price->product_id = $product->id;
                $price->variant_id = $variantId;
                $price->branch_id = $data['branch_id'] ?? null;
                $price->channel = $data['channel'];
                $price->revision = 1;
            }
            if (! $price->variant_id && $data['is_active'] && $product->variants()->exists()) {
                throw ValidationException::withMessages(['variant_id' => 'Este producto requiere presentación. Configura su precio desde cada variante.']);
            }
            $price->fill(['amount' => $data['amount'], 'is_active' => $data['is_active']])->save();
            $product->revision++;
            $product->save();
            Audit::record('catalog.context_price.'.($existing ? 'updated' : 'created'), 'Se guardó un precio explícito por sucursal/canal.', $actor, ['product_id' => $product->id, 'price_id' => $price->id, 'revision' => $price->revision, 'product_revision' => $product->revision]);

            return $price->refresh();
        });
    }
}
