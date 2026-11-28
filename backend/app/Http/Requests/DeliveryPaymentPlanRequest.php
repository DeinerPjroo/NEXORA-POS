<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class DeliveryPaymentPlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.view') && $this->user()->can('orders.manage');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'],
            'payment_method_id' => ['present', 'nullable', 'integer', 'min:1'], 'method_revision' => ['required_with:payment_method_id', 'nullable', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'min:3', 'max:200']];
    }
}
