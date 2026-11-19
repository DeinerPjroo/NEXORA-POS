<?php

namespace App\Http\Requests;

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
            'dining_session_id' => ['nullable', 'integer', Rule::exists('dining_sessions', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'dining_session_revision' => ['required_with:dining_session_id', 'integer', 'min:1'],
            'branch_id' => ['required', 'integer', Rule::exists('branches', 'id')->where('tenant_id', app(TenantContext::class)->id())],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'channel' => ['required', Rule::in(['dine_in', 'takeaway'])],
            'reference' => ['nullable', 'string', 'max:80'], 'customer_name' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
            ...OrderLineRules::rules(),
            'subtotal' => ['prohibited'], 'status' => ['prohibited'],
        ];
    }
}
