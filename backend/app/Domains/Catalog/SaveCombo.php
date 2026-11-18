<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Product;
use App\Models\ProductComboComponent;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class SaveCombo
{
    public function settings(User $actor, Product $product, array $data): Product
    {
        Gate::authorize('update', $product);

        return app(IdempotentOperation::class)->run($actor, 'catalog.combo.settings.'.$product->id, $data, Product::class, function ($data) use ($actor, $product) {
            $product = $this->lock($actor, $product, $data);
            $product->combo_allocation_mode = $data['allocation_mode'];
            $product->revision++;
            $product->save();
            Audit::record('catalog.combo.settings', 'Se configuró el reparto de precio del combo.', $actor, ['product_id' => $product->id, 'revision' => $product->revision, 'allocation_mode' => $product->combo_allocation_mode]);

            return $product;
        });
    }

    public function component(User $actor, Product $product, array $data, ?ProductComboComponent $component = null): ProductComboComponent
    {
        Gate::authorize('update', $product);
        $action = $component ? 'catalog.combo.component.update.'.$component->id : 'catalog.combo.component.create.'.$product->id;

        return app(IdempotentOperation::class)->run($actor, $action, $data, ProductComboComponent::class, function ($data) use ($actor, $product, $component) {
            $product = $this->lock($actor, $product, $data);
            $existing = $component !== null;
            $component = $existing ? $product->comboComponents()->lockForUpdate()->findOrFail($component->id) : new ProductComboComponent;
            if ($existing) {
                abort_unless($component->revision === (int) $data['revision'], 409, 'El componente cambió. Actualiza la configuración.');
            } else {
                $leaf = Product::whereKey($data['component_product_id'])->lockForUpdate()->firstOrFail();
                abort_unless($leaf->kind === 'regular', 422, 'Elige un producto individual; no se permiten combos anidados.');
                abort_unless($leaf->revision === (int) $data['component_product_revision'], 409, 'El producto elegido cambió. Revisa la selección.');
                $variantId = $data['component_variant_id'] ?? null;
                if ($leaf->variants()->exists()) {
                    abort_unless($variantId && $leaf->variants()->whereKey($variantId)->exists(), 422, 'Selecciona una presentación del componente.');
                } else {
                    abort_if($variantId !== null, 422, 'La presentación no corresponde al componente.');
                }
                $component->product_id = $product->id;
                $component->component_product_id = $leaf->id;
                $component->component_variant_id = $variantId;
                $component->combo_group_id = $data['combo_group_id'] ?? null;
            }
            $group = $component->combo_group_id ? $product->comboGroups()->lockForUpdate()->findOrFail($component->combo_group_id) : null;
            abort_if($group && $data['is_active'] && $product->comboComponents()->where('combo_group_id', $group->id)->where('is_active', true)->when($existing, fn ($q) => $q->whereKeyNot($component->id))->count() >= 20, 422, 'El grupo admite hasta 20 alternativas activas.');
            $component->fill(array_intersect_key($data, array_flip($component->getFillable())));
            $component->revision = $existing ? $component->revision + 1 : 1;
            $component->save();
            ComboBounds::assert($product);
            if ($group) {
                $group->revision++;
                $group->save();
            }
            $product->revision++;
            $product->save();
            Audit::record('catalog.combo.component.'.($existing ? 'updated' : 'created'), 'Se guardó un componente del combo.', $actor, ['product_id' => $product->id, 'component_id' => $component->id, 'revision' => $component->revision, 'product_revision' => $product->revision]);

            return $component->refresh();
        });
    }

    private function lock(User $actor, Product $product, array $data): Product
    {
        $product = app(ModifierProductContext::class)->lock($actor, $product, $data, 'el combo');
        abort_unless($product->kind === 'combo', 422, 'Este producto no es un combo.');

        return $product;
    }
}
