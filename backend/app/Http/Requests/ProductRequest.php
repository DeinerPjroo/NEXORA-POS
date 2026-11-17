<?php

namespace App\Http\Requests;

use App\Domains\Tenancy\TenantContext;
use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        $product = $this->route('product');

        return $product ? $this->user()->can('update', $product) : $this->user()->can('create', Product::class);
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['sku' => strtoupper(trim((string) $this->input('sku')))]);
    }

    public function rules(): array
    {
        $tenantId = app(TenantContext::class)->id();
        $money = ['string', 'regex:/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?$/D'];

        return [
            'name' => ['required', 'string', 'max:150'],
            'sku' => ['required', 'string', 'max:40', 'regex:/^[A-Z0-9_-]+$/D', Rule::unique('products', 'sku')->where('tenant_id', $tenantId)->ignore($this->route('product')?->id)],
            'barcode' => ['nullable', 'string', 'max:64', 'regex:/^[0-9A-Za-z_-]+$/D', Rule::unique('products', 'barcode')->where('tenant_id', $tenantId)->ignore($this->route('product')?->id)],
            'category_id' => ['required', 'integer', Rule::exists('categories', 'id')->where('tenant_id', $tenantId)],
            'description' => ['nullable', 'string', 'max:1000'],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'sale_price' => ['required', ...$money],
            'cost_price' => [$this->user()->hasPermission('catalog.costs') ? 'sometimes' : 'prohibited', ...$money],
            'is_active' => ['required', 'boolean'],
            'is_available' => ['required', 'boolean'],
            'revision' => [$this->isMethod('PUT') ? 'required' : 'prohibited', 'integer', 'min:1'],
            'tenant_id' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return [
            'sale_price.regex' => 'Ingresa el precio sin separadores de miles y con hasta 4 decimales, usando punto.',
            'cost_price.regex' => 'Ingresa el costo sin separadores de miles y con hasta 4 decimales, usando punto.',
            'category_id.exists' => 'Selecciona una categoría de tu empresa.',
        ];
    }
}
