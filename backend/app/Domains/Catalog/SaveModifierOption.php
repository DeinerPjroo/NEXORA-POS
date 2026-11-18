<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Product;
use App\Models\ProductModifierGroup;
use App\Models\ProductModifierOption;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaveModifierOption
{
    public function execute(User $actor, Product $product, ProductModifierGroup $group, array $data, ?ProductModifierOption $option = null): ProductModifierOption
    {
        Gate::authorize('update', $product);
        $action = $option ? 'catalog.modifier-option.update.'.$option->id : 'catalog.modifier-option.create.'.$group->id;

        return app(IdempotentOperation::class)->run($actor, $action, $data, ProductModifierOption::class, function ($data) use ($actor, $product, $group, $option) {
            $product = app(ModifierProductContext::class)->lock($actor, $product, $data);
            $group = $product->modifierGroups()->lockForUpdate()->findOrFail($group->id);
            $existing = $option !== null;
            $option = $existing ? $group->options()->lockForUpdate()->findOrFail($option->id) : new ProductModifierOption;
            if ($group->options()->where('name', $data['name'])->when($existing, fn ($q) => $q->where('id', '<>', $option->id))->exists()) {
                throw ValidationException::withMessages(['name' => 'Este grupo ya tiene una opción con ese nombre.']);
            }
            if ($group->kind === 'exclusion' && bccomp($data['extra_price'], '0', 4) !== 0) {
                throw ValidationException::withMessages(['extra_price' => 'Las exclusiones deben tener importe adicional cero.']);
            }
            $activeOthers = $group->options()->where('is_active', true)->when($existing, fn ($q) => $q->where('id', '<>', $option->id))->count();
            $activeAfter = $activeOthers + ($data['is_active'] ? 1 : 0);
            if ($activeAfter > 20 || ($group->is_active && $activeAfter < $group->min_select)) {
                throw ValidationException::withMessages(['is_active' => 'Conserva suficientes opciones para el mínimo del grupo y no más de 20 activas.']);
            }
            $option->product_id = $product->id;
            $option->modifier_group_id = $group->id;
            $option->fill(Arr::only($data, ['name', 'extra_price', 'is_active', 'position']))->save();
            $group->revision++;
            $group->save();
            $product->revision++;
            $product->save();
            Audit::record('catalog.modifier_option.'.($existing ? 'updated' : 'created'), 'Se guardó la opción «'.$option->name.'».', $actor, ['product_id' => $product->id, 'group_id' => $group->id, 'option_id' => $option->id, 'product_revision' => $product->revision, 'group_revision' => $group->revision]);

            return $option->refresh();
        });
    }
}
