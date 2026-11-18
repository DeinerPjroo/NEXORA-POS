<?php

namespace App\Http\Requests;

use App\Domains\Operations\Money;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ModifierOptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])], 'name' => ['required', 'string', 'max:80'],
            'extra_price' => ['required', ...Money::rules()], 'is_active' => ['required', 'boolean'], 'position' => ['sometimes', 'integer', 'between:0,999'],
            'tenant_id' => ['prohibited'], 'product_id' => ['prohibited'], 'modifier_group_id' => ['prohibited']];
    }
}
