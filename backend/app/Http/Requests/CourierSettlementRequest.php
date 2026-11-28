<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleTotals;
use Illuminate\Foundation\Http\FormRequest;

final class CourierSettlementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.view') && $this->user()->can('orders.manage') && $this->user()->can('cash.view') && $this->user()->can('cash.movements');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'collection_revision' => ['required', 'integer', 'min:1'],
            'expected_pending' => ['required', ...SaleTotals::cashRules()], 'amount' => ['required', ...SaleTotals::cashRules()],
            'cash_session_id' => ['required', 'integer', 'min:1'], 'cash_revision' => ['required', 'integer', 'min:1'],
            'confirmed_handover' => ['required', 'accepted'], 'reason' => ['required', 'string', 'min:3', 'max:250']];
    }
}
