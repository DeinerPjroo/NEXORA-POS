<?php

namespace App\Domains\Orders;

use Illuminate\Support\Collection;

final class ComboSelection
{
    public static function components(int $productId, Collection $components, Collection $groups, array $line): Collection
    {
        abort_unless(($line['kind'] ?? null) === 'combo' && empty($line['variant_id']) && empty($line['modifiers']), 422, 'Configura el combo con sus componentes.');
        $groups = $groups->where('product_id', $productId);
        $components = $components->where('product_id', $productId);
        abort_unless($groups->isEmpty() || ($line['selection_version'] ?? null) === 2, 409, 'El combo tiene alternativas. Actualiza su configuración y selección.');
        $chosen = collect($line['components'] ?? []);
        $identities = $chosen->map(fn ($part) => $part['component_id'].':'.$part['unit_index']);
        abort_if($identities->unique()->count() !== $chosen->count(), 422, 'No repitas una unidad de componente.');
        $ids = $chosen->pluck('component_id')->unique();
        abort_if($ids->diff($components->pluck('id'))->isNotEmpty(), 409, 'Una alternativa ya no pertenece a la composición activa.');
        $selected = $components->whereNull('combo_group_id')->values();
        foreach ($groups as $group) {
            $options = $components->where('combo_group_id', $group->id)->whereIn('id', $ids);
            abort_unless($options->count() >= $group->min_select && $options->count() <= $group->max_select, 409, 'Revisa el mínimo y máximo de alternativas de '.$group->name.'.');
            $selected = $selected->concat($options);
        }
        $units = $selected->sum('units');
        abort_unless($units > 0 && $units <= 20 && $chosen->count() === $units, 409, 'La composición del combo debe incluir entre 1 y 20 unidades completas.');
        foreach ($selected as $component) {
            for ($unit = 0; $unit < $component->units; $unit++) {
                abort_unless($identities->contains($component->id.':'.$unit), 409, 'Revisa todas las unidades de los componentes elegidos.');
            }
        }

        return $selected->values();
    }
}
