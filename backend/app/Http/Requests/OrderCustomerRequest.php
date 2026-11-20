<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class OrderCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.manage') && $this->user()->can('orders.view');
    }

    public function rules(): array
    {
        return [
            'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'],
            'customer_name' => ['present', 'nullable', 'string', 'max:100'],
            'reference' => ['present', 'nullable', 'string', 'max:80'],
            'reason' => ['required', 'string', 'min:3', 'max:250'],
            'delivery' => ['sometimes', 'array:revision,recipient_name,phone,address,instructions'],
            'delivery.revision' => ['required_with:delivery', 'integer', 'min:1'],
            'delivery.recipient_name' => ['required_with:delivery', 'string', 'max:100'],
            'delivery.phone' => ['required_with:delivery', 'string', 'min:3', 'max:30'],
            'delivery.address' => ['required_with:delivery', 'string', 'min:5', 'max:300'],
            'delivery.instructions' => ['nullable', 'string', 'max:300'],
            'tenant_id' => ['prohibited'], 'branch_id' => ['prohibited'], 'items' => ['prohibited'],
            'channel' => ['prohibited'], 'notes' => ['prohibited'], 'subtotal' => ['prohibited'], 'sale_id' => ['prohibited'],
        ];
    }
}
