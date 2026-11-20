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
            'append_order_id' => ['nullable', 'integer', Rule::exists('orders', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'order_revision' => ['required_with:append_order_id', 'integer', 'min:1'],
            'dining_session_id' => ['required_with:append_order_id', 'nullable', 'integer', Rule::exists('dining_sessions', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'dining_session_revision' => ['required_with:dining_session_id', 'integer', 'min:1'],
            'branch_id' => ['required', 'integer', Rule::exists('branches', 'id')->where('tenant_id', app(TenantContext::class)->id())],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'channel' => ['required', Rule::in(['dine_in', 'takeaway', 'delivery'])],
            'delivery' => ['required_if:channel,delivery', 'prohibited_unless:channel,delivery', 'array:recipient_name,phone,address,instructions'],
            'delivery.recipient_name' => ['required_with:delivery', 'string', 'max:100'],
            'delivery.phone' => ['required_with:delivery', 'string', 'min:3', 'max:30'],
            'delivery.address' => ['required_with:delivery', 'string', 'min:5', 'max:300'],
            'delivery.instructions' => ['nullable', 'string', 'max:300'],
            'reference' => ['nullable', 'string', 'max:80'], 'customer_name' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
            ...OrderLineRules::rules(),
            'subtotal' => ['prohibited'], 'status' => ['prohibited'],
        ];
    }
}
