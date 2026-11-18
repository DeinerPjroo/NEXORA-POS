<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CatalogFiltersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('catalog.view');
    }

    public function rules(): array
    {
        return [
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'category_id' => ['sometimes', 'integer', 'min:1'],
            'parent_id' => ['sometimes', 'integer', Rule::exists('categories', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'level' => ['sometimes', Rule::in(['root', 'child'])],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'availability' => ['sometimes', Rule::in(['available', 'unavailable'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ];
    }
}
