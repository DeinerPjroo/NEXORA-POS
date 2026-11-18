<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Models\Product;
use App\Models\ProductModifierGroup;
use App\Models\ProductModifierOption;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaveModifierGroup
{
    public function execute(User $actor, Product $product, array $data, ?ProductModifierGroup $group = null): ProductModifierGroup
    {
        Gate::authorize('update', $product);
        $action = $group ? 'catalog.modifier-group.update.'.$group->id : 'catalog.modifier-group.create.'.$product->id;

        return app(IdempotentOperation::class)->run($actor, $action, $data, ProductModifierGroup::class, function ($data) use ($actor, $product, $group) {
            $product = app(ModifierProductContext::class)->lock($actor, $product, $data);
            abort_if($product->kind === 'combo', 422, 'Los adicionales se eligen desde los componentes del combo.');
            $existing = $group !== null;
            $group = $existing ? $product->modifierGroups()->lockForUpdate()->findOrFail($group->id) : new ProductModifierGroup;
            if ($product->modifierGroups()->where('name', $data['name'])->when($existing, fn ($q) => $q->where('id', '<>', $group->id))->exists()) {
                throw ValidationException::withMessages(['name' => 'Este producto ya tiene un grupo con ese nombre.']);
            }
            if ($data['is_active'] && $product->modifierGroups()->where('is_active', true)->when($existing, fn ($q) => $q->where('id', '<>', $group->id))->count() >= 8) {
                throw ValidationException::withMessages(['is_active' => 'Se permiten hasta 8 grupos activos por producto. Archiva otro antes de activar este.']);
            }
            $activeOptions = $existing ? $group->options()->where('is_active', true)->count() : count(array_filter($data['options'], fn ($option) => (bool) $option['is_active']));
            if ($data['is_active'] && $activeOptions < (int) $data['min_select']) {
                throw ValidationException::withMessages(['min_select' => 'El grupo necesita suficientes opciones activas para cumplir su mínimo.']);
            }
            if (! $existing) {
                $group->product_id = $product->id;
                $group->kind = $data['kind'];
                $group->revision = 1;
                if ($group->kind === 'exclusion' && collect($data['options'])->contains(fn ($option) => bccomp($option['extra_price'], '0', 4) !== 0)) {
                    throw ValidationException::withMessages(['options' => 'Las exclusiones deben tener importe adicional cero.']);
                }
            } else {
                $group->revision++;
            }
            $group->fill(Arr::only($data, ['name', 'min_select', 'max_select', 'is_active', 'position']))->save();
            if (! $existing) {
                foreach ($data['options'] as $index => $input) {
                    $option = new ProductModifierOption([...$input, 'extra_price' => Money::normalize($input['extra_price']), 'position' => $input['position'] ?? $index]);
                    $option->product_id = $product->id;
                    $option->modifier_group_id = $group->id;
                    $option->save();
                }
            }
            $product->revision++;
            $product->save();
            Audit::record('catalog.modifier_group.'.($existing ? 'updated' : 'created'), 'Se guardó el grupo de modificadores «'.$group->name.'».', $actor, ['product_id' => $product->id, 'group_id' => $group->id, 'product_revision' => $product->revision, 'group_revision' => $group->revision]);

            return $group->refresh();
        });
    }
}
