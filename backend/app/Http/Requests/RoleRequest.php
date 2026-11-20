<?php

namespace App\Http\Requests;

use App\Domains\Tenancy\TenantContext;
use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class RoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->route('role') ? $this->user()->can('update', $this->route('role')) : $this->user()->can('create', Role::class);
    }

    public function rules(): array
    {
        return [
            'revision' => [$this->route('role') ? 'required' : 'sometimes', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:80', Rule::unique('roles', 'name')->where('tenant_id', app(TenantContext::class)->id())->ignore($this->route('role')?->id)],
            'permissions' => ['present', 'array', 'max:50'],
            'permissions.*' => ['required', 'string', 'distinct', Rule::exists('permissions', 'key')],
            'is_owner' => ['prohibited'], 'tenant_id' => ['prohibited'],
        ];
    }
}
