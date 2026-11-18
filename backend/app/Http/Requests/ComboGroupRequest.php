<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ComboGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'], 'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'revision' => [$this->isMethod('POST') ? 'prohibited' : 'required', 'integer', 'min:1'], 'name' => ['required', 'string', 'max:80'],
            'min_select' => ['required', 'integer', 'between:0,20'], 'max_select' => ['required', 'integer', 'between:1,20', 'gte:min_select'],
            'position' => ['required', 'integer', 'between:0,999'], 'is_active' => ['required', 'boolean'], 'tenant_id' => ['prohibited'], 'product_id' => ['prohibited']];
    }
}
