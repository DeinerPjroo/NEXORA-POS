<?php

namespace App\Http\Requests;

use App\Domains\Operations\Money;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ModifierGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return [
            'idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'name' => ['required', 'string', 'max:80'],
            'kind' => [$creating ? 'required' : 'prohibited', Rule::in(['addon', 'exclusion'])],
            'min_select' => ['required', 'integer', 'between:0,20', 'lte:max_select'],
            'max_select' => ['required', 'integer', 'between:1,20'],
            'is_active' => ['required', 'boolean'], 'position' => ['sometimes', 'integer', 'between:0,999'],
            'options' => [$creating ? 'required' : 'prohibited', 'array', 'list', 'min:1', 'max:20'],
            'options.*' => ['required', 'array:name,extra_price,is_active,position'],
            'options.*.name' => ['required', 'string', 'max:80', 'distinct:ignore_case'],
            'options.*.extra_price' => ['required', ...Money::rules()],
            'options.*.is_active' => ['required', 'boolean'],
            'options.*.position' => ['sometimes', 'integer', 'between:0,999'],
            'tenant_id' => ['prohibited'], 'product_id' => ['prohibited'], 'revision' => ['prohibited'],
        ];
    }
}
