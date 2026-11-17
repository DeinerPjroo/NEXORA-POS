<?php

namespace App\Http\Requests;

use App\Domains\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class BranchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['code' => strtoupper(trim((string) $this->input('code')))]);
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'code' => ['required', 'string', 'max:20', 'regex:/^[A-Z0-9_-]+$/', Rule::unique('branches', 'code')->where('tenant_id', app(TenantContext::class)->id())->ignore($this->route('branch')?->id)],
            'address' => ['nullable', 'string', 'max:200'], 'city' => ['nullable', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:30'], 'is_active' => ['sometimes', 'boolean'],
            'tenant_id' => ['prohibited'],
        ];
    }
}
