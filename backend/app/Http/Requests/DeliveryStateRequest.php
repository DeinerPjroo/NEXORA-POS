<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class DeliveryStateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.view') && ($this->user()->can('orders.manage') || $this->user()->can('deliveries.operate'));
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'], 'status' => ['required', 'in:assigned,out_for_delivery,delivered,failed,returned'], 'courier_id' => ['required_if:status,assigned', 'prohibited_unless:status,assigned', 'integer', 'min:1'], 'reason' => ['required_if:status,failed,returned', 'nullable', 'string', 'min:3', 'max:250']];
    }
}
