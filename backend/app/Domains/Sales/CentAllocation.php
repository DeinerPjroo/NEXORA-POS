<?php

namespace App\Domains\Sales;

use LogicException;

final class CentAllocation
{
    // Enteros decimales como cadenas; mayores restos, empate por posición estable.
    public static function distribute(string $target, array $weights): array
    {
        if (! array_is_list($weights) || ! preg_match('/^[0-9]+$/D', $target)) {
            throw new LogicException('La distribución exige enteros no negativos y pesos ordenados.');
        }
        $sum = '0';
        foreach ($weights as $weight) {
            if (! is_string($weight) || ! preg_match('/^[0-9]+$/D', $weight)) {
                throw new LogicException('Los pesos deben ser enteros decimales como cadenas.');
            }
            $sum = bcadd($sum, $weight, 0);
        }
        if (bccomp($sum, '0', 0) === 0) {
            if (bccomp($target, '0', 0) !== 0) {
                throw new LogicException('No se puede distribuir un importe positivo sin pesos.');
            }

            return array_fill(0, count($weights), '0');
        }
        $parts = [];
        $remainders = [];
        $applied = '0';
        foreach ($weights as $index => $weight) {
            $numerator = bcmul($target, $weight, 0);
            $parts[$index] = bcdiv($numerator, $sum, 0);
            $remainders[$index] = bcmod($numerator, $sum, 0);
            $applied = bcadd($applied, $parts[$index], 0);
        }
        $rank = array_keys($weights);
        usort($rank, fn ($a, $b) => bccomp($remainders[$b], $remainders[$a], 0) ?: $a <=> $b);
        // Por construcción, quedan menos centavos que pesos; los importes nunca pasan a int.
        $remaining = (int) bcsub($target, $applied, 0);
        for ($index = 0; $index < $remaining; $index++) {
            $parts[$rank[$index]] = bcadd($parts[$rank[$index]], '1', 0);
        }

        return $parts;
    }
}
