<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class PaymentMethodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('sales.configure');
    }

    protected function prepareForValidation(): void
    {
        if ($this->isMethod('POST') && is_string($this->input('code'))) {
            $this->merge(['code' => strtolower(trim((string) $this->input('code')))]);
        }
    }

    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:60'], 'is_active' => ['required', 'boolean'],
            'tenant_id' => ['prohibited'], 'is_system' => ['prohibited']] + ($this->isMethod('POST') ? [
                'idempotency_key' => ['required', 'uuid'], 'code' => ['required', 'string', 'min:2', 'max:20', 'regex:/^[a-z0-9_-]+$/D'],
                'kind' => ['required', Rule::in(['cash', 'non_cash'])],
            ] : ['revision' => ['required', 'integer', 'min:1'], 'code' => ['prohibited'], 'kind' => ['prohibited']]);
    }
}
