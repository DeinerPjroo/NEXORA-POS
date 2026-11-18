<?php

namespace App\Domains\Catalog;

use App\Models\Product;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class AvailabilitySchedule
{
    // Evaluación de hora de pared: ambas ocurrencias de una hora repetida tienen igual elegibilidad.
    public function evaluate(Product $product, Collection $windows, CarbonImmutable $instant, string $timezone): array
    {
        $local = $instant->setTimezone($timezone);
        $clock = $local->format('H:i');
        $matches = [];
        if ($product->availability_schedule_enabled) {
            foreach ($windows as $window) {
                if ($window->product_id !== $product->id || ! $window->is_active) {
                    continue;
                }
                foreach ([$local, $local->subDay()] as $anchor) {
                    $sameDay = $anchor->toDateString() === $local->toDateString();
                    $date = $anchor->toDateString();
                    if ($window->weekday !== $anchor->dayOfWeekIso || ($window->valid_from && $date < $window->valid_from) || ($window->valid_until && $date > $window->valid_until)) {
                        continue;
                    }
                    $inside = $window->ends_next_day
                        ? ($sameDay ? $clock >= $window->start_time : $clock < $window->end_time)
                        : ($sameDay && $clock >= $window->start_time && $clock < $window->end_time);
                    if ($inside) {
                        $matches[] = [...$window->only('id', 'name', 'weekday', 'start_time', 'end_time', 'ends_next_day', 'valid_from', 'valid_until', 'revision'), 'anchor_date' => $date];
                        break;
                    }
                }
            }
        }
        $allowed = ! $product->availability_schedule_enabled || count($matches) > 0;

        return ['version' => 1, 'enabled' => (bool) $product->availability_schedule_enabled, 'allowed' => $allowed,
            'reason' => $allowed ? null : 'Fuera del horario de disponibilidad', 'timezone' => $timezone,
            'checked_at' => $instant->utc()->toIso8601String(), 'product_revision' => $product->revision, 'windows' => $matches];
    }

    public function decorate(Collection $products, string $timezone, ?CarbonImmutable $instant = null): void
    {
        $instant ??= CarbonImmutable::now();
        $products->loadMissing(['availabilityWindows' => fn ($query) => $query->where('is_active', true)->orderBy('id')]);
        foreach ($products as $product) {
            $product->setAttribute('availability_context', $this->evaluate($product, $product->availabilityWindows, $instant, $timezone));
        }
    }
}
