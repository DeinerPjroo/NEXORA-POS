<?php

namespace App\Domains\Dining;

use App\Models\DiningReservation;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

final class ReservationWindows
{
    public static function pending(array $tableIds): Builder
    {
        return DiningReservation::where('status', 'booked')->whereHas('tables', fn ($q) => $q->whereIn('dining_table_id', $tableIds));
    }

    public static function hasUpcoming(array $tableIds): bool
    {
        return self::pending($tableIds)->where('ends_at', '>', now())->exists();
    }

    public static function conflicts(array $ids, CarbonImmutable $start, CarbonImmutable $end, ?int $except = null): bool
    {
        return DiningReservation::where(fn ($q) => $q->where('status', 'booked')->orWhere(fn ($q) => $q->where('status', 'arrived')->whereHas('session', fn ($q) => $q->where('status', 'open'))))
            ->whereHas('tables', fn ($q) => $q->whereIn('dining_table_id', $ids))->where('starts_at', '<', $end)->where('ends_at', '>', $start)
            ->when($except, fn ($q) => $q->whereKeyNot($except))->exists();
    }

    public static function assertAvailableNow(array $ids, ?int $except = null): void
    {
        abort_if(self::pending($ids)->where('starts_at', '<=', now())->where('ends_at', '>', now())->when($except, fn ($q) => $q->whereKeyNot($except))->exists(), 409, 'Una mesa tiene una reserva en curso. Registra su llegada desde Reservas.');
    }
}
