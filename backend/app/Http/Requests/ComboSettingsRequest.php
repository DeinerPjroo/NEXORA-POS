<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ComboSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'], 'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])], 'allocation_mode' => ['required', Rule::in(['proportional', 'equal'])], 'tenant_id' => ['prohibited']];
    }
}
