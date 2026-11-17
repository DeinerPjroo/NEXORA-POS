<?php

namespace App\Domains\Sales;

use Illuminate\Validation\Rule;

final class SaleAdjustmentRules
{
    public static function rules(): array
    {
        return [
            'discount_type' => ['sometimes', Rule::in(['fixed', 'percentage'])],
            'discount_amount' => ['required_unless:discount_type,percentage', 'prohibited_if:discount_type,percentage', ...SaleTotals::cashRules()],
            'discount_value' => ['required_if:discount_type,percentage', 'prohibited_unless:discount_type,percentage', 'string', 'regex:/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/D', 'numeric', 'between:0,100'],
            'tip_amount' => ['sometimes', ...SaleTotals::cashRules()],
        ];
    }

    public static function positive(mixed $value): bool
    {
        return is_string($value) && preg_match('/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/D', $value) && bccomp($value, '0', 4) > 0;
    }
}
