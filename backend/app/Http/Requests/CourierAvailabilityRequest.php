<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class CourierAvailabilityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.view') && $this->user()->can('orders.manage');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'branch_id' => ['required', 'integer', 'min:1'],
            'available' => ['required', 'boolean'], 'revision' => ['required', 'integer', 'min:0'],
            'idempotency_key' => ['required', 'uuid'], 'reason' => ['required', 'string', 'min:3', 'max:250']];
    }
}
