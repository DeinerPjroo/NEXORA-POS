<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class OrderPreviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.manage') && $this->user()->hasPermission('catalog.view');
    }

    public function rules(): array
    {
        return ['branch_id' => ['required', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])], 'channel' => ['required', Rule::in(['takeaway', 'dine_in', 'delivery'])],
            'tenant_id' => ['prohibited'], 'idempotency_key' => ['prohibited'], 'subtotal' => ['prohibited'], ...OrderLineRules::rules(false)];
    }
}
