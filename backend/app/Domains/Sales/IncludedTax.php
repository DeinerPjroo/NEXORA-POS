<?php

namespace App\Domains\Sales;

final class IncludedTax
{
    // Importe participante en centavos; tasa validada global o suma de hasta 5 tasas.
    // Redondear base una vez y obtener impuesto por diferencia conserva el precio final.
    public static function extract(string $gross, string $rate): array
    {
        $base = SaleTotals::round(bcdiv(bcmul($gross, '100', 18), bcadd('100', $rate, 4), 18));

        return ['base' => $base, 'tax' => bcsub($gross, $base, 4)];
    }
}
