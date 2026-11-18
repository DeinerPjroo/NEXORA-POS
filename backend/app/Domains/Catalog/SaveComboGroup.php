<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Product;
use App\Models\ProductComboGroup;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class SaveComboGroup
{
    public function execute(User $actor, Product $product, array $data, ?ProductComboGroup $group = null): ProductComboGroup
    {
        Gate::authorize('update', $product);
        $action = $group ? 'catalog.combo.group.update.'.$group->id : 'catalog.combo.group.create.'.$product->id;

        return app(IdempotentOperation::class)->run($actor, $action, $data, ProductComboGroup::class, function ($data) use ($actor, $product, $group) {
            $product = app(ModifierProductContext::class)->lock($actor, $product, $data, 'el grupo del combo');
            abort_unless($product->kind === 'combo', 422, 'Este producto no es un combo.');
            $existing = $group !== null;
            $group = $existing ? $product->comboGroups()->lockForUpdate()->findOrFail($group->id) : new ProductComboGroup;
            abort_if($existing && $group->revision !== (int) $data['revision'], 409, 'El grupo cambió. Actualiza los datos.');
            abort_if($data['is_active'] && $product->comboGroups()->where('is_active', true)->when($existing, fn ($q) => $q->whereKeyNot($group->id))->count() >= 8, 422, 'Se permiten hasta 8 grupos activos por combo.');
            $group->product_id = $product->id;
            $group->fill(array_intersect_key($data, array_flip($group->getFillable())));
            $group->revision = $existing ? $group->revision + 1 : 1;
            $group->save();
            ComboBounds::assert($product);
            $product->revision++;
            $product->save();
            Audit::record('catalog.combo.group.'.($existing ? 'updated' : 'created'), 'Se guardó un grupo de alternativas del combo.', $actor, ['product_id' => $product->id, 'group_id' => $group->id, 'revision' => $group->revision]);

            return $group->refresh();
        });
    }
}
