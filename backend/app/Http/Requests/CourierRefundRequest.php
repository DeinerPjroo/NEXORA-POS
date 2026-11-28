<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleTotals;
use Illuminate\Foundation\Http\FormRequest;

final class CourierRefundRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.view') && $this->user()->can('orders.manage') && $this->user()->can('sales.refund');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'cash_session_id' => ['prohibited'], 'cash_revision' => ['prohibited'],
            'idempotency_key' => ['required', 'uuid'], 'sale_revision' => ['required', 'integer', 'min:1'], 'collection_revision' => ['required', 'integer', 'min:1'],
            'expected_pending' => ['required', ...SaleTotals::cashRules()], 'expected_refundable' => ['required', ...SaleTotals::cashRules()], 'amount' => ['required', ...SaleTotals::cashRules()],
            'confirmed_handover' => ['required', 'accepted'], 'reason' => ['required', 'string', 'min:3', 'max:250']];
    }
}
