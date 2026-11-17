<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleAdjustmentRules;
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
            'cash_revision' => ['required', 'integer', 'min:1'], 'tenant_id' => ['prohibited'], 'total' => ['prohibited'], 'tax_rate' => ['prohibited'], 'provenance' => ['prohibited'], 'provider_confirmed' => ['prohibited']];

        return $common + ($this->routeIs('sales.refund') ? ['reason' => ['required', 'string', 'min:3', 'max:300'], 'refund_reference' => ['nullable', 'string', 'max:120'],
            'sale_revision' => ['sometimes', 'integer', 'min:1'], 'refund_references' => ['sometimes', 'array', 'list'],
            'refund_references.*' => ['array:payment_id,reference'], 'refund_references.*.payment_id' => ['required', 'integer', 'min:1', 'distinct'], 'refund_references.*.reference' => ['required', 'string', 'max:120']] : [
                'payment_amount' => ['sometimes', ...SaleTotals::cashRules()],
                'payment_method_id' => ['sometimes', 'integer', 'min:1'], 'method_revision' => ['required_with:payment_method_id', 'integer', 'min:1'],
                'payment_reference' => ['nullable', 'string', 'max:120'],
                'order_revision' => ['required', 'integer', 'min:1'], 'settings_revision' => ['required', 'integer', 'min:1'],
                'discount_reason' => [Rule::requiredIf(fn () => SaleAdjustmentRules::positive($this->input($this->input('discount_type') === 'percentage' ? 'discount_value' : 'discount_amount'))), 'nullable', 'string', 'min:3', 'max:200'],
                'tip_confirmed' => SaleAdjustmentRules::positive($this->input('tip_amount')) ? ['required', 'accepted'] : ['sometimes', 'boolean'],
                'expected_total' => ['required', ...SaleTotals::cashRules()], 'received_amount' => ['required', ...SaleTotals::cashRules()],
            ] + SaleAdjustmentRules::rules());
    }
}
