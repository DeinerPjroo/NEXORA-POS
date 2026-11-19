<?php

namespace App\Domains\Dining;

use Illuminate\Validation\ValidationException;

final class LayoutGeometry
{
    public static function rules(string $prefix, bool $table = false): array
    {
        return [$prefix.'x' => ['required', 'integer', 'between:0,1000'], $prefix.'y' => ['required', 'integer', 'between:0,700'],
            $prefix.'width' => ['required', 'integer', $table ? 'between:32,240' : 'between:1,1000'], $prefix.'height' => ['required', 'integer', $table ? 'between:32,240' : 'between:1,700'],
            $prefix.'rotation' => ['required', 'integer', 'between:0,359']];
    }

    public static function assert(array $geometry, ?string $shape = null): void
    {
        if ($geometry['x'] + $geometry['width'] > 1000 || $geometry['y'] + $geometry['height'] > 700) {
            throw ValidationException::withMessages(['layout' => 'Los elementos deben caber en el plano de 1000 × 700.']);
        }
        if ($shape && $shape !== 'rectangle' && $geometry['width'] !== $geometry['height']) {
            throw ValidationException::withMessages(['layout' => 'Las mesas redondas y cuadradas requieren ancho y alto iguales.']);
        }
    }
}
