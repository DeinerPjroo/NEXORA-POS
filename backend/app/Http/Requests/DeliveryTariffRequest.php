<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleTotals;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DeliveryTariffRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('deliveries.configure');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'branch_id' => ['required', 'integer', 'min:1'], 'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:0'], 'currency' => ['required', 'in:COP,USD,EUR'],
            'is_enabled' => ['required', 'boolean'], 'default_fee' => ['required', ...SaleTotals::cashRules()], 'free_from' => ['nullable', ...SaleTotals::cashRules()],
            'tax_profile_id' => [Rule::requiredIf($this->boolean('is_enabled')), 'nullable', 'integer', 'min:1'], 'tax_profile_revision' => ['required_with:tax_profile_id', 'integer', 'min:1']];
    }
}
