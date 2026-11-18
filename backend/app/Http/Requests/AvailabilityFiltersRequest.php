<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class AvailabilityFiltersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('view', $this->route('product'));
    }

    public function rules(): array
    {
        return ['status' => ['sometimes', Rule::in(['active', 'inactive'])], 'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,50'], 'tenant_id' => ['prohibited']];
    }
}
