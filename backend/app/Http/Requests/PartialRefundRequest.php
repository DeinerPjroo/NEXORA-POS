<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleTotals;
use Illuminate\Foundation\Http\FormRequest;

final class PartialRefundRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('sales.refund');
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'sale_revision' => ['required', 'integer', 'min:1'],
            'expected_refundable' => ['required', ...SaleTotals::cashRules()], 'cash_session_id' => ['required', 'integer', 'min:1'], 'cash_revision' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'min:3', 'max:300'], 'refunds' => ['required', 'array', 'list', 'min:1', 'max:20'],
            'refunds.*' => ['required', 'array:payment_id,amount,reference'], 'refunds.*.payment_id' => ['required', 'integer', 'min:1', 'distinct'],
            'refunds.*.amount' => ['required', ...SaleTotals::cashRules()], 'refunds.*.reference' => ['nullable', 'string', 'max:120'],
            'tenant_id' => ['prohibited'], 'total' => ['prohibited'], 'provenance' => ['prohibited'], 'provider_confirmed' => ['prohibited'],
            'tip_amount' => ['prohibited'], 'tip_confirmed' => ['prohibited'], 'discount_type' => ['prohibited'], 'discount_value' => ['prohibited'], 'discount_amount' => ['prohibited']];
    }
}
