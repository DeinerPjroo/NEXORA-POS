<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleTotals;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class SaleCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission($this->routeIs('sales.refund') ? 'sales.refund' : 'sales.collect');
    }

    public function rules(): array
    {
        $common = ['idempotency_key' => ['required', 'uuid'], 'cash_session_id' => ['required', 'integer', 'min:1'],
            'cash_revision' => ['required', 'integer', 'min:1'], 'tenant_id' => ['prohibited'], 'total' => ['prohibited'], 'tax_rate' => ['prohibited']];

        return $common + ($this->routeIs('sales.refund') ? ['reason' => ['required', 'string', 'min:3', 'max:300']] : [
            'order_revision' => ['required', 'integer', 'min:1'], 'settings_revision' => ['required', 'integer', 'min:1'],
            'discount_amount' => ['required', ...SaleTotals::cashRules()],
            'discount_reason' => [Rule::requiredIf(fn () => is_string($this->input('discount_amount')) && preg_match('/^[0-9]+(?:\.[0-9]{1,2})?$/D', $this->input('discount_amount')) && bccomp($this->input('discount_amount'), '0', 4) > 0), 'nullable', 'string', 'min:3', 'max:200'],
            'expected_total' => ['required', ...SaleTotals::cashRules()], 'received_amount' => ['required', ...SaleTotals::cashRules()],
        ]);
    }
}
