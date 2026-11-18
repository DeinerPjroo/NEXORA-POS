<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ComboComponentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        $create = $this->isMethod('POST');

        return ['idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'], 'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'revision' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'component_product_id' => [$create ? 'required' : 'prohibited', 'integer', Rule::exists('products', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'component_product_revision' => [$create ? 'required' : 'prohibited', 'integer', 'min:1'],
            'component_variant_id' => [$create ? 'sometimes' : 'prohibited', 'nullable', 'integer', Rule::exists('product_variants', 'id')->where('tenant_id', $this->user()->tenant_id)->where('product_id', $this->input('component_product_id'))],
            'units' => ['required', 'integer', 'between:1,20'], 'position' => ['required', 'integer', 'between:0,999'], 'is_active' => ['required', 'boolean'], 'tenant_id' => ['prohibited'], 'product_id' => ['prohibited']];
    }
}
