<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleTotals;
use Illuminate\Foundation\Http\FormRequest;

final class AddPaymentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('sales.collect');
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'sale_revision' => ['required', 'integer', 'min:1'],
            'expected_balance' => ['required', ...SaleTotals::cashRules()], 'cash_session_id' => ['required', 'integer', 'min:1'], 'cash_revision' => ['required', 'integer', 'min:1'],
            'payments' => ['required', 'array', 'list', 'min:1', 'max:20'], 'payments.*' => ['required', 'array:payment_method_id,method_revision,amount,received_amount,reference'],
            'payments.*.payment_method_id' => ['required', 'integer', 'min:1'], 'payments.*.method_revision' => ['required', 'integer', 'min:1'],
            'payments.*.amount' => ['required', ...SaleTotals::cashRules()], 'payments.*.received_amount' => ['required', ...SaleTotals::cashRules()],
            'payments.*.reference' => ['nullable', 'string', 'max:120'], 'tenant_id' => ['prohibited'], 'provenance' => ['prohibited'], 'total' => ['prohibited'],
            'tip_amount' => ['prohibited'], 'tip_confirmed' => ['prohibited'], 'discount_type' => ['prohibited'], 'discount_value' => ['prohibited'], 'discount_amount' => ['prohibited']];
    }
}
