<?php

namespace App\Http\Requests;

use App\Domains\Operations\Money;
use App\Domains\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class OrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.manage') && $this->user()->hasPermission('catalog.view');
    }

    public function rules(): array
    {
        return [
            'idempotency_key' => ['required', 'uuid'], 'tenant_id' => ['prohibited'],
            'branch_id' => ['required', 'integer', Rule::exists('branches', 'id')->where('tenant_id', app(TenantContext::class)->id())],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'channel' => ['required', Rule::in(['dine_in', 'takeaway'])],
            'reference' => ['nullable', 'string', 'max:80'], 'customer_name' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*' => ['required', 'array:product_id,variant_id,quantity,notes,product_revision,expected_unit_price'],
            'items.*.product_id' => ['required', 'integer', 'min:1'],
            'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
            'items.*.product_revision' => ['required', 'integer', 'min:1'],
            'items.*.expected_unit_price' => ['required', ...Money::rules()],
            'items.*.notes' => ['nullable', 'string', 'max:300'],
            'subtotal' => ['prohibited'], 'status' => ['prohibited'],
        ];
    }
}
