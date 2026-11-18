<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ContextPriceFiltersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('catalog.view');
    }

    public function rules(): array
    {
        return ['variant_id' => ['sometimes', 'nullable', 'integer', Rule::exists('product_variants', 'id')->where('tenant_id', $this->user()->tenant_id)->where('product_id', $this->route('product')->id)],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])], 'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,50'], 'tenant_id' => ['prohibited']];
    }
}
