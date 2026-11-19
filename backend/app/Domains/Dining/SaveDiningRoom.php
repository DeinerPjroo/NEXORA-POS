<?php

namespace App\Domains\Dining;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Branch;
use App\Models\DiningRoom;
use App\Models\DiningSessionTable;
use App\Models\DiningTable;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaveDiningRoom
{
    public function room(User $actor, array $data, ?DiningRoom $room = null): DiningRoom
    {
        Gate::authorize('dining.manage');
        $action = $room ? 'dining.room.update.'.$room->id : 'dining.room.create';

        return app(IdempotentOperation::class)->run($actor, $action, $data, DiningRoom::class, function ($data) use ($actor, $room) {
            $existing = $room !== null;
            $room = $existing ? $this->lock($room, $data['revision']) : new DiningRoom;
            if (! $existing) {
                $room->branch_id = Branch::whereKey($data['branch_id'])->lockForUpdate()->firstOrFail()->id;
            }
            $room->fill(array_intersect_key($data, array_flip($room->getFillable())));
            abort_if($existing && ! $room->is_active && ReservationWindows::hasUpcoming($room->diningTables()->pluck('id')->all()), 409, 'El salón tiene reservas pendientes. Reprograma o cancela esas reservas antes de archivarlo.');
            abort_if($existing && ! $room->is_active && DiningSessionTable::whereIn('dining_table_id', $room->diningTables()->select('id'))->whereNull('released_at')->exists(), 409, 'El salón tiene mesas ocupadas. Cierra las atenciones antes de archivarlo.');
            if (DiningRoom::where('branch_id', $room->branch_id)->where('name', $room->name)->when($existing, fn ($q) => $q->whereKeyNot($room->id))->exists()) {
                throw ValidationException::withMessages(['name' => 'Este nombre ya existe en la sucursal.']);
            }
            $room->revision = $existing ? $room->revision + 1 : 1;
            $room->save();
            Audit::record('dining.room.'.($existing ? 'updated' : 'created'), 'Se guardó un salón.', $actor, ['room_id' => $room->id, 'revision' => $room->revision]);

            return $room;
        });
    }

    public function table(User $actor, DiningRoom $room, array $data, ?DiningTable $table = null): DiningTable
    {
        Gate::authorize('dining.manage');
        $action = $table ? 'dining.table.update.'.$table->id : 'dining.table.create.'.$room->id;

        return app(IdempotentOperation::class)->run($actor, $action, $data, DiningTable::class, function ($data) use ($actor, $room, $table) {
            $room = $this->lock($room, $data['room_revision']);
            $existing = $table !== null;
            $table = $existing ? $room->diningTables()->lockForUpdate()->findOrFail($table->id) : new DiningTable;
            abort_if($existing && DiningSessionTable::where('dining_table_id', $table->id)->whereNull('released_at')->exists(), 409, 'La mesa está ocupada. Cierra la atención antes de editarla.');
            abort_if($existing && $table->revision !== (int) $data['revision'], 409, 'La mesa cambió. Actualiza sus datos.');
            abort_if($existing && (! $data['is_active'] || (int) $data['capacity'] < $table->capacity) && ReservationWindows::hasUpcoming([$table->id]), 409, 'La mesa tiene reservas pendientes. No se puede archivar ni reducir su capacidad.');
            $count = $room->diningTables()->where('is_active', true)->when($existing, fn ($q) => $q->whereKeyNot($table->id))->count();
            abort_if($data['is_active'] && $count >= 48, 422, 'El salón admite hasta 48 mesas activas.');
            if (! $existing) {
                $table->branch_id = $room->branch_id;
                $table->dining_room_id = $room->id;
                $table->x = 40 + ($count % 8) * 110;
                $table->y = 40 + intdiv($count, 8) * 100;
                $table->width = 80;
                $table->height = 80;
                $table->rotation = 0;
            }
            $table->fill(array_intersect_key($data, array_flip($table->getFillable())));
            if ($room->diningTables()->where('name', $table->name)->when($existing, fn ($q) => $q->whereKeyNot($table->id))->exists()) {
                throw ValidationException::withMessages(['name' => 'Este nombre ya existe en el salón.']);
            }
            if ($table->shape !== 'rectangle') {
                $table->height = $table->width;
            }
            LayoutGeometry::assert($table->only('x', 'y', 'width', 'height', 'rotation'), $table->shape);
            $table->revision = $existing ? $table->revision + 1 : 1;
            $table->save();
            $room->revision++;
            $room->save();
            Audit::record('dining.table.'.($existing ? 'updated' : 'created'), 'Se guardó una mesa configurada.', $actor, ['room_id' => $room->id, 'table_id' => $table->id, 'room_revision' => $room->revision]);

            return $table;
        });
    }

    public function layout(User $actor, DiningRoom $room, array $data): DiningRoom
    {
        Gate::authorize('dining.manage');

        return app(IdempotentOperation::class)->run($actor, 'dining.layout.update.'.$room->id, $data, DiningRoom::class, function ($data) use ($actor, $room) {
            $room = $this->lock($room, $data['revision']);
            $tables = $room->diningTables()->where('is_active', true)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $ids = array_map('intval', array_column($data['tables'], 'id'));
            abort_unless(count($ids) === $tables->count() && count(array_unique($ids)) === count($ids) && $tables->keys()->diff($ids)->isEmpty(), 409, 'La distribución debe incluir todas las mesas activas del salón una sola vez.');
            foreach ($data['objects'] as $object) {
                LayoutGeometry::assert($object);
            }
            foreach ($data['tables'] as $geometry) {
                $table = $tables->get((int) $geometry['id']);
                $geometry = array_map('intval', array_intersect_key($geometry, array_flip(['x', 'y', 'width', 'height', 'rotation'])));
                LayoutGeometry::assert($geometry, $table->shape);
                foreach ($geometry as $key => $value) {
                    $table->{$key} = $value;
                }
                if ($table->isDirty()) {
                    $table->revision++;
                    $table->save();
                }
            }
            $room->objects = $data['objects'];
            $room->layout_schema_version = 1;
            $room->revision++;
            $room->save();
            Audit::record('dining.layout.updated', 'Se guardó una distribución visual de salón.', $actor, ['room_id' => $room->id, 'revision' => $room->revision, 'tables' => count($ids), 'objects' => count($data['objects'])]);

            return $room;
        });
    }

    private function lock(DiningRoom $room, int $revision): DiningRoom
    {
        $room = DiningRoom::whereKey($room->id)->lockForUpdate()->firstOrFail();
        abort_unless($room->revision === $revision, 409, 'El salón cambió. Revisa la distribución antes de guardar.');

        return $room;
    }
}
