<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class VariantRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['sku' => strtoupper(trim((string) $this->input('sku')))]);
    }

    public function rules(): array
    {
        $money = ['string', 'regex:/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?$/D'];

        return [
            'name' => ['required', 'string', 'max:80'],
            'sku' => ['required', 'string', 'max:40', 'regex:/^[A-Z0-9_-]+$/D'],
            'barcode' => ['nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/D'],
            'sale_price' => ['required', ...$money],
            'cost_price' => [$this->user()->hasPermission('catalog.costs') ? 'sometimes' : 'prohibited', ...$money],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'product_revision' => ['required', 'integer', 'min:1'],
            'is_active' => ['required', 'boolean'], 'is_available' => ['required', 'boolean'],
            'tenant_id' => ['prohibited'], 'product_id' => ['prohibited'],
        ];
    }
}
