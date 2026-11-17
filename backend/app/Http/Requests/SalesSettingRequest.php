<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class SalesSettingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('sales.configure');
    }

    public function rules(): array
    {
        return ['revision' => ['required', 'integer', 'min:1'], 'confirmed' => ['required', 'accepted'],
            'tax_mode' => ['required', Rule::in(['none', 'exclusive', 'inclusive'])], 'tax_name' => ['required', 'string', 'max:40'],
            'tax_rate' => ['required', 'string', 'regex:/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,4})?$/D', 'numeric', 'between:0,100'],
            'tip_enabled' => ['sometimes', 'boolean'], 'tip_tax_mode' => [Rule::requiredIf(fn () => $this->boolean('tip_enabled')), 'nullable', Rule::in(['included', 'excluded'])],
            'tenant_id' => ['prohibited'], 'next_receipt_number' => ['prohibited']];
    }
}
