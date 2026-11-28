<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleTotals;
use Illuminate\Foundation\Http\FormRequest;

final class CourierCollectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.view') && $this->user()->can('orders.manage') && $this->user()->can('sales.collect');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'cash_session_id' => ['prohibited'], 'cash_revision' => ['prohibited'], 'payment_amount' => ['prohibited'], 'split_count' => ['prohibited'], 'payment_method_id' => ['prohibited'],
            'idempotency_key' => ['required', 'uuid'], 'delivery_revision' => ['required', 'integer', 'min:1'],
            'order_revision' => ['required', 'integer', 'min:1'], 'settings_revision' => ['required', 'integer', 'min:1'],
            'expected_total' => ['required', ...SaleTotals::cashRules()], 'received_amount' => ['required', ...SaleTotals::cashRules()],
            'confirmed_received' => ['required', 'accepted'], 'reason' => ['required', 'string', 'min:3', 'max:250']];
    }
}
