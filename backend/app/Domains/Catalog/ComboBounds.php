<?php

namespace App\Domains\Catalog;

use App\Models\Product;
use Illuminate\Validation\ValidationException;

final class ComboBounds
{
    public static function assert(Product $product): void
    {
        $parts = $product->comboComponents()->where('is_active', true)->get();
        $units = $parts->whereNull('combo_group_id')->sum('units');
        foreach ($product->comboGroups()->where('is_active', true)->get() as $group) {
            $options = $parts->where('combo_group_id', $group->id);
            if ($options->count() < $group->min_select) {
                throw ValidationException::withMessages(['min_select' => 'El grupo necesita suficientes alternativas activas para cumplir su mínimo.']);
            }
            $units += $options->sortBy('units')->take($group->min_select)->sum('units');
        }
        if ($units > 20) {
            throw ValidationException::withMessages(['units' => 'La selección mínima del combo supera 20 unidades. Reduce componentes o mínimos.']);
        }
    }
}
