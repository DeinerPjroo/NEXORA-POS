<?php

namespace App\Domains\Orders;

use App\Domains\Operations\Money;
use App\Models\Product;
use Illuminate\Validation\ValidationException;

final class OrderModifiers
{
    public function resolve(Product $product, string $basePrice, array $selections): array
    {
        $product->loadMissing(['modifierGroups' => fn ($q) => $q->where('is_active', true), 'modifierGroups.options' => fn ($q) => $q->where('is_active', true)]);
        $groups = $product->modifierGroups->where('is_active', true)->sortBy([['position', 'asc'], ['id', 'asc']])->keyBy('id');
        $chosen = [];
        foreach ($selections as $selection) {
            $id = (int) $selection['group_id'];
            if (array_key_exists($id, $chosen)) {
                throw ValidationException::withMessages(['items' => 'No repitas un grupo de modificadores en la misma línea.']);
            }
            abort_unless($groups->has($id), 409, 'La configuración de modificadores cambió o no corresponde al producto. Revisa la selección.');
            $ids = array_map('intval', $selection['option_ids']);
            if (count($ids) !== count(array_unique($ids))) {
                throw ValidationException::withMessages(['items' => 'Cada opción puede seleccionarse una sola vez por unidad de producto.']);
            }
            $chosen[$id] = $ids;
        }
        $extra = '0.0000';
        $snapshot = [];
        foreach ($groups as $group) {
            $ids = $chosen[$group->id] ?? [];
            if (count($ids) < $group->min_select || count($ids) > $group->max_select) {
                throw ValidationException::withMessages(['items' => 'Revisa el mínimo y máximo de opciones del grupo «'.$group->name.'».']);
            }
            $options = $group->options->where('is_active', true)->whereIn('id', $ids)->sortBy([['position', 'asc'], ['id', 'asc']]);
            abort_unless($options->count() === count($ids), 409, 'Una opción cambió o no pertenece al grupo. Actualiza la selección.');
            if ($options->isEmpty()) {
                continue;
            }
            $copied = [];
            foreach ($options as $option) {
                $extra = Money::bounded(bcadd($extra, $option->extra_price, 4));
                $copied[] = $option->only('id', 'name', 'extra_price');
            }
            $snapshot[] = ['group_id' => $group->id, 'group_name' => $group->name, 'kind' => $group->kind, 'group_revision' => $group->revision, 'options' => $copied];
        }

        return ['base_unit_price' => Money::normalize($basePrice), 'unit_price' => Money::bounded(bcadd($basePrice, $extra, 4)), 'snapshot' => $snapshot];
    }
}
