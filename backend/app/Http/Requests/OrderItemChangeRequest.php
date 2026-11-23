<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class OrderItemChangeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('orders.view') && $this->user()->hasPermission('orders.manage') && $this->user()->hasPermission('orders.cancel');
    }

    public function rules(): array
    {
        return [
            'idempotency_key' => ['required', 'uuid'], 'tenant_id' => ['prohibited'],
            'order_revision' => ['required', 'integer', 'min:1'], 'delivery_revision' => ['required', 'integer', 'min:1'],
            'item_id' => ['required', 'integer', 'min:1'], 'action' => ['required', Rule::in(['correct', 'cancel'])],
            'quantity' => ['required_if:action,correct', 'prohibited_if:action,cancel', 'integer', 'between:1,999'],
            'notes' => ['present_if:action,correct', 'prohibited_if:action,cancel', 'nullable', 'string', 'max:300'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ];
    }
}
