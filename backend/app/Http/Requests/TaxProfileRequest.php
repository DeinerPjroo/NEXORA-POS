<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class TaxProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('sales.configure');
    }

    public function rules(): array
    {
        return ['idempotency_key' => [$this->isMethod('POST') ? 'required' : 'prohibited', 'uuid'],
            'revision' => [$this->isMethod('PUT') ? 'required' : 'prohibited', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:60'],
            'price_mode' => ['required', Rule::in(['inclusive', 'exclusive'])], 'is_active' => ['required', 'boolean'],
            'rates' => ['required', 'array', 'list', 'min:1', 'max:5'], 'rates.*' => ['required', 'array:name,rate'],
            'rates.*.name' => ['required', 'string', 'max:40', 'distinct:ignore_case'],
            'rates.*.rate' => ['required', 'string', 'regex:/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,4})?$/D', 'numeric', 'between:0,100'],
            'tenant_id' => ['prohibited']];
    }
}
