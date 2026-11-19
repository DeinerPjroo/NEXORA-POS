<?php

namespace App\Domains\Kitchen;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Branch;
use App\Models\KitchenStation;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaveKitchenStation
{
    public function execute(User $actor, array $data, ?KitchenStation $station = null): KitchenStation
    {
        Gate::authorize('kitchen.manage');

        return app(IdempotentOperation::class)->run($actor, $station ? 'kitchen.station.update.'.$station->id : 'kitchen.station.create', $data, KitchenStation::class, function ($data) use ($actor, $station) {
            $existing = $station !== null;
            $station = $existing ? KitchenStation::whereKey($station->id)->lockForUpdate()->firstOrFail() : new KitchenStation;
            abort_if($existing && $station->revision !== (int) $data['revision'], 409, 'La estación cambió. Revisa sus datos antes de guardar.');
            if (! $existing) {
                $station->branch_id = Branch::whereKey($data['branch_id'])->lockForUpdate()->firstOrFail()->id;
            }
            $station->fill(array_intersect_key($data, array_flip($station->getFillable())));
            if (KitchenStation::where('branch_id', $station->branch_id)->where('name', $station->name)->when($existing, fn ($q) => $q->whereKeyNot($station->id))->exists()) {
                throw ValidationException::withMessages(['name' => 'Ya existe una estación con este nombre en la sucursal.']);
            }
            $station->revision = $existing ? $station->revision + 1 : 1;
            $station->save();
            Audit::record('kitchen.station.'.($existing ? 'updated' : 'created'), 'Se guardó una estación de cocina.', $actor, ['station_id' => $station->id, 'revision' => $station->revision]);

            return $station;
        });
    }
}
