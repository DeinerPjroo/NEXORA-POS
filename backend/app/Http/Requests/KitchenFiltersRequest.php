<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class KitchenFiltersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('kitchen.view');
    }

    public function rules(): array
    {
        return ['search' => ['nullable', 'string', 'max:80'], 'status' => ['nullable', Rule::in(['active', 'archived'])],
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,50']];
    }
}
