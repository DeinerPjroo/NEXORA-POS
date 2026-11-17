<?php

namespace App\Http\Requests;

use App\Domains\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class RoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80', Rule::unique('roles', 'name')->where('tenant_id', app(TenantContext::class)->id())->ignore($this->route('role')?->id)],
            'permissions' => ['present', 'array', 'max:50'],
            'permissions.*' => ['required', 'string', 'distinct', Rule::exists('permissions', 'key')],
            'is_owner' => ['prohibited'], 'tenant_id' => ['prohibited'],
        ];
    }
}
