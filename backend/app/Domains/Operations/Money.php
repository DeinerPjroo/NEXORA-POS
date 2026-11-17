<?php

namespace App\Domains\Operations;

use Illuminate\Validation\ValidationException;

final class Money
{
    public static function rules(): array
    {
        return ['string', 'regex:/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?$/D'];
    }

    public static function normalize(string $value): string
    {
        return bcadd($value, '0', 4);
    }

    public static function bounded(string $value): string
    {
        if (bccomp($value, '999999999999999.9999', 4) > 0 || bccomp($value, '0', 4) < 0) {
            throw ValidationException::withMessages(['amount' => 'El importe acumulado excede el rango permitido.']);
        }

        return self::normalize($value);
    }
}
