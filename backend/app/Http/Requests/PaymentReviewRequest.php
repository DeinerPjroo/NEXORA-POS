<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleTotals;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class PaymentReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('sales.reconcile');
    }

    public function rules(): array
    {
        $pending = $this->input('status') === 'pending';

        return ['idempotency_key' => ['required', 'uuid'], 'sale_revision' => ['required', 'integer', 'min:1'], 'review_revision' => ['required', 'integer', 'min:0'],
            'expected_net_amount' => ['required', ...SaleTotals::cashRules()], 'status' => ['required', Rule::in(['matched', 'difference', 'pending'])],
            'observed_amount' => [$pending ? 'prohibited' : 'required', 'nullable', ...SaleTotals::cashRules()],
            'reference' => [$pending ? 'nullable' : 'required', 'string', 'max:120'],
            'notes' => [$this->input('status') === 'matched' ? 'nullable' : 'required', 'string', 'min:3', 'max:300'],
            'review_confirmed' => ['required', 'accepted'], 'tenant_id' => ['prohibited'], 'provenance' => ['prohibited'], 'provider_confirmed' => ['prohibited'],
            'amount' => ['prohibited'], 'total' => ['prohibited'], 'cash_session_id' => ['prohibited']];
    }
}
