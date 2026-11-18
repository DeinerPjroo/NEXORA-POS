<?php

namespace App\Http\Requests;

use App\Domains\Operations\Money;

final class OrderLineRules
{
    public static function rules(bool $expectations = true): array
    {
        $keys = 'product_id,variant_id,quantity,notes,modifiers,kind,components'.($expectations ? ',product_revision,expected_unit_price,expected_tax_revision' : '');
        $rules = ['items' => ['required', 'array', 'list', 'min:1', 'max:100'], 'items.*' => ['required', 'array:'.$keys],
            'items.*.product_id' => ['required', 'integer', 'min:1'], 'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'between:1,999'], 'items.*.notes' => ['nullable', 'string', 'max:300'],
            'items.*.modifiers' => ['sometimes', 'array', 'list', 'max:8'], 'items.*.modifiers.*' => ['required', 'array:group_id,option_ids'],
            'items.*.modifiers.*.group_id' => ['required', 'integer', 'min:1'], 'items.*.modifiers.*.option_ids' => ['present', 'array', 'list', 'max:20'],
            'items.*.modifiers.*.option_ids.*' => ['required', 'integer', 'min:1']];
        if ($expectations) {
            $rules += ['items.*.product_revision' => ['required', 'integer', 'min:1'], 'items.*.expected_unit_price' => ['required', ...Money::rules()], 'items.*.expected_tax_revision' => ['sometimes', 'nullable', 'integer', 'min:1']];
        }

        $rules += ['items.*.kind' => ['sometimes', 'in:regular,combo'], 'items.*.components' => ['sometimes', 'array', 'list', 'min:1', 'max:20'],
            'items.*.components.*' => ['required', 'array:component_id,unit_index,notes,modifiers'.($expectations ? ',product_revision,expected_tax_revision' : '')],
            'items.*.components.*.component_id' => ['required', 'integer', 'min:1'], 'items.*.components.*.unit_index' => ['required', 'integer', 'between:0,19'],
            'items.*.components.*.notes' => ['nullable', 'string', 'max:300']];
        foreach ($rules as $key => $rule) {
            if (str_starts_with($key, 'items.*.modifiers')) {
                $rules[str_replace('items.*.modifiers', 'items.*.components.*.modifiers', $key)] = $rule;
            }
        }
        if ($expectations) {
            $rules += ['items.*.components.*.product_revision' => ['required', 'integer', 'min:1'], 'items.*.components.*.expected_tax_revision' => ['sometimes', 'nullable', 'integer', 'min:1']];
        }

        return $rules;
    }
}
