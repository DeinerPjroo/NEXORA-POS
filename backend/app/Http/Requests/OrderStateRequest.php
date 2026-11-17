<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class OrderStateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission($this->input('status') === 'cancelled' ? 'orders.cancel' : 'orders.manage');
    }

    public function rules(): array
    {
        return [
            'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'],
            'status' => ['required', Rule::in(['preparing', 'ready', 'delivered', 'cancelled'])],
            'reason' => [Rule::requiredIf($this->input('status') === 'cancelled'), 'nullable', 'string', 'min:3', 'max:300'],
            'tenant_id' => ['prohibited'],
        ];
    }
}
