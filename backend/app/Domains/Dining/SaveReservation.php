<?php

namespace App\Domains\Dining;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Branch;
use App\Models\DiningReservation;
use App\Models\DiningRoom;
use App\Models\DiningTable;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class SaveReservation
{
    public function save(User $actor, array $data, ?DiningReservation $reservation = null): DiningReservation
    {
        Gate::authorize('dining.reserve');

        return app(IdempotentOperation::class)->run($actor, $reservation ? 'dining.reservation.update.'.$reservation->id : 'dining.reservation.create', $data, DiningReservation::class, function ($data) use ($actor, $reservation) {
            $existing = $reservation !== null;
            $reservation = $existing ? $this->lock($reservation, (int) $data['revision']) : new DiningReservation(['branch_id' => $data['branch_id'], 'created_by' => $actor->id, 'status' => 'booked', 'revision' => 0]);
            $branch = Branch::whereKey($reservation->branch_id)->lockForUpdate()->firstOrFail();
            abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
            $timezone = $actor->tenant()->firstOrFail()->timezone;
            abort_unless($timezone === $data['expected_timezone'], 409, 'La zona horaria cambió. Vuelve a abrir la reserva.');
            $start = $this->time($data['starts_at'], $timezone);
            $end = $this->time($data['ends_at'], $timezone);
            $now = CarbonImmutable::now();
            if ($start->lt($now) || $start->gt($now->addYear()) || $end->diffInMinutes($start, true) < 15 || $end->diffInHours($start, true) > 12 || $end->lte($start)) {
                throw ValidationException::withMessages(['starts_at' => 'Reserva entre 15 minutos y 12 horas, con inicio futuro dentro del próximo año.']);
            }
            $tables = DiningTable::whereIn('id', array_column($data['tables'], 'id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            abort_unless($tables->count() === count($data['tables']), 422, 'Alguna mesa no pertenece a tu empresa.');
            foreach ($data['tables'] as $expected) {
                $table = $tables->get((int) $expected['id']);
                abort_unless($table->revision === (int) $expected['revision'], 409, 'Una mesa cambió. Revisa la configuración.');
                abort_unless($table->branch_id === (int) $reservation->branch_id && $table->is_active && DiningRoom::whereKey($table->dining_room_id)->where('is_active', true)->exists(), 409, 'Selecciona mesas activas de esta sucursal.');
            }
            abort_if($data['guest_count'] > $tables->sum('capacity'), 422, 'Las mesas no tienen capacidad para todas las personas.');
            abort_if(ReservationWindows::conflicts($tables->keys()->all(), $start, $end, $reservation->id), 409, 'Las mesas ya tienen otra reserva que cruza este horario.');
            $before = $existing ? $this->snapshot($reservation) : null;
            $reservation->fill(array_intersect_key($data, array_flip(['guest_name', 'phone', 'notes', 'guest_count'])));
            $reservation->booking_timezone = $timezone;
            $reservation->starts_at = $start;
            $reservation->ends_at = $end;
            $reservation->revision++;
            $reservation->save();
            foreach ($reservation->tables()->lockForUpdate()->get() as $member) {
                $member->is_active = false;
                $member->save();
            }
            foreach ($tables as $table) {
                $reservation->tables()->create(['branch_id' => $reservation->branch_id, 'dining_table_id' => $table->id, 'table_name' => $table->name]);
            }
            Audit::record('dining.reservation.'.($existing ? 'updated' : 'created'), 'Se guardó una reserva de mesas.', $actor, ['reservation_id' => $reservation->id, 'revision' => $reservation->revision, 'before' => $before, 'after' => $this->snapshot($reservation)]);

            return $reservation;
        });
    }

    public function state(User $actor, DiningReservation $reservation, array $data): DiningReservation
    {
        Gate::authorize('dining.reserve');
        if ($data['status'] === 'arrived') {
            Gate::authorize('dining.operate');
        }

        return app(IdempotentOperation::class)->run($actor, 'dining.reservation.state.'.$reservation->id, $data, DiningReservation::class, function ($data) use ($actor, $reservation) {
            $reservation = $this->lock($reservation, (int) $data['revision']);
            if ($data['status'] === 'no_show') {
                abort_unless(CarbonImmutable::now()->gte($reservation->ends_at), 409, 'Marca inasistencia cuando termine el horario reservado.');
            }
            if ($data['status'] === 'arrived') {
                $now = CarbonImmutable::now();
                abort_unless($now->gte($reservation->starts_at->subMinutes(30)) && $now->lt($reservation->ends_at), 409, 'La llegada se registra desde 30 minutos antes del inicio hasta el final de la reserva.');
                $ids = $reservation->tables()->pluck('dining_table_id');
                $tables = DiningTable::whereIn('id', $ids)->get();
                $session = app(DiningOccupancy::class)->save($actor, ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $reservation->branch_id, 'guest_count' => $reservation->guest_count, 'waiter_id' => $data['waiter_id'], 'notes' => $reservation->notes, 'tables' => $tables->map(fn ($t) => ['id' => $t->id, 'revision' => $t->revision])->all()], null, $reservation->id);
                $reservation->dining_session_id = $session->id;
            }
            $reservation->status = $data['status'];
            $reservation->revision++;
            $reservation->save();
            Audit::record('dining.reservation.'.$reservation->status, 'Se registró un cambio de estado de reserva.', $actor, ['reservation_id' => $reservation->id, 'revision' => $reservation->revision, 'session_id' => $reservation->dining_session_id]);

            return $reservation;
        });
    }

    private function lock(DiningReservation $reservation, int $revision): DiningReservation
    {
        $reservation = DiningReservation::whereKey($reservation->id)->lockForUpdate()->firstOrFail();
        abort_unless($reservation->status === 'booked' && $reservation->revision === $revision, 409, 'La reserva cambió o ya no está pendiente. Actualiza sus datos.');

        return $reservation;
    }

    private function time(string $value, string $timezone): CarbonImmutable
    {
        $instant = CarbonImmutable::createFromFormat('!Y-m-d\\TH:i:sP', $value);
        if ($instant->setTimezone($timezone)->format('Y-m-d\\TH:i:sP') !== $value) {
            throw ValidationException::withMessages(['starts_at' => 'El horario y su desplazamiento deben corresponder a la zona horaria de la empresa.']);
        }

        return $instant->setTimezone(config('app.timezone'));
    }

    private function snapshot(DiningReservation $r): array
    {
        return ['guest_name' => $r->guest_name, 'phone' => $r->phone, 'guest_count' => $r->guest_count, 'starts_at' => $r->starts_at?->toIso8601String(), 'ends_at' => $r->ends_at?->toIso8601String(), 'timezone' => $r->booking_timezone, 'tables' => $r->tables()->orderBy('id')->get()->map(fn ($t) => ['id' => $t->dining_table_id, 'name' => $t->table_name])->all()];
    }
}
