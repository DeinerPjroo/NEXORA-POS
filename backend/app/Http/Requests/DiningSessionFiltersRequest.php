<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DiningSessionFiltersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.view');
    }

    public function rules(): array
    {
        return ['branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)], 'status' => ['nullable', Rule::in(['open', 'closed'])], 'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,50']];
    }
}
