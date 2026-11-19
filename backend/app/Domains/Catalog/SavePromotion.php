<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class SavePromotion
{
    public function execute(User $actor, Product $product, array $data, ?ProductPromotion $promotion = null): ProductPromotion
    {
        Gate::authorize('update', $product);
        $action = $promotion ? 'catalog.promotion.update.'.$promotion->id : 'catalog.promotion.create.'.$product->id;

        return app(IdempotentOperation::class)->run($actor, $action, $data, ProductPromotion::class, function ($data) use ($actor, $product, $promotion) {
            $product = app(ModifierProductContext::class)->lock($actor, $product, $data, 'promociones');
            abort_unless($actor->tenant()->value('timezone') === $data['expected_timezone'], 409, 'La zona horaria cambió. Revisa la vigencia antes de guardar.');
            $existing = $promotion !== null;
            $promotion = $existing ? $product->promotions()->lockForUpdate()->findOrFail($promotion->id) : new ProductPromotion;
            abort_if($existing && $promotion->revision !== (int) $data['revision'], 409, 'La promoción cambió. Actualiza sus datos.');
            if (! $existing) {
                $variantId = $data['variant_id'] ?? null;
                if ($variantId) {
                    $product->variants()->whereKey($variantId)->firstOrFail();
                }
                $promotion->product_id = $product->id;
                $promotion->variant_id = $variantId;
                $promotion->branch_id = $data['branch_id'] ?? null;
                $promotion->channel = $data['channel'];
            }
            abort_if(! $promotion->variant_id && $data['is_active'] && $product->variants()->exists(), 422, 'Este producto usa presentaciones. Configura la promoción en cada variante.');
            abort_if($data['is_active'] && $product->promotions()->where('is_active', true)->when($existing, fn ($q) => $q->whereKeyNot($promotion->id))->count() >= 20, 422, 'Un producto admite hasta 20 promociones activas entre sus presentaciones.');
            $promotion->fill(array_intersect_key($data, array_flip($promotion->getFillable())));
            $promotion->revision = $existing ? $promotion->revision + 1 : 1;
            $promotion->save();
            $product->revision++;
            $product->save();
            Audit::record('catalog.promotion.'.($existing ? 'updated' : 'created'), 'Se guardó una promoción de catálogo.', $actor, ['product_id' => $product->id, 'promotion_id' => $promotion->id, 'revision' => $promotion->revision, 'product_revision' => $product->revision]);

            return $promotion->refresh();
        });
    }
}
