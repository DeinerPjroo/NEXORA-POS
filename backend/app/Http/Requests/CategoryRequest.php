<?php

namespace App\Http\Requests;

use App\Domains\Tenancy\TenantContext;
use App\Models\Category;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        $category = $this->route('category');

        return $category ? $this->user()->can('update', $category) : $this->user()->can('create', Category::class);
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100', Rule::unique('categories')->where('tenant_id', app(TenantContext::class)->id())->ignore($this->route('category')?->id)],
            'description' => ['nullable', 'string', 'max:500'],
            'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'is_active' => ['required', 'boolean'],
            'parent_id' => ['sometimes', 'nullable', 'integer', Rule::exists('categories', 'id')->where('tenant_id', app(TenantContext::class)->id())],
            'parent_revision' => [Rule::requiredIf(fn () => filled($this->input('parent_id'))), 'nullable', 'integer', 'min:1'],
            'revision' => [$this->isMethod('PUT') ? 'required' : 'prohibited', 'integer', 'min:1'],
            'tenant_id' => ['prohibited'],
        ];
    }
}
