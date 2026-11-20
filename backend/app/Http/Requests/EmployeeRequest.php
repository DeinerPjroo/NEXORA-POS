<?php

namespace App\Http\Requests;

use App\Rules\PasswordByteLength;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

final class EmployeeRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->has('email')) {
            $this->merge(['email' => mb_strtolower(trim((string) $this->input('email')))]);
        }
    }

    public function authorize(): bool
    {
        return $this->user()->can($this->routeIs('employees.security') ? 'team.credentials' : 'team.manage');
    }

    public function rules(): array
    {
        $security = $this->routeIs('employees.security');
        $rules = ['idempotency_key' => ['required', 'uuid'], 'revision' => [$this->route('employee') ? 'required' : 'sometimes', 'integer', 'min:1'], 'tenant_id' => ['prohibited'], 'all_branches' => ['prohibited'], 'is_owner' => ['prohibited']];
        $password = ['string', 'max:72', 'confirmed', new PasswordByteLength, Password::min(12)->mixedCase()->numbers()];
        if ($security) {
            return [...$rules, 'action' => ['required', 'in:password,revoke'], 'password' => ['required_if:action,password', 'prohibited_if:action,revoke', ...$password], 'clear_pin' => ['sometimes', 'boolean']];
        }

        return [...$rules, 'name' => ['required', 'string', 'max:100'], 'email' => ['required', 'email', 'max:190'], 'role_id' => ['required', 'integer'], 'is_active' => ['required', 'boolean'], 'branch_ids' => ['required', 'array', 'min:1', 'max:100'], 'branch_ids.*' => ['required', 'integer', 'distinct'], 'password' => [$this->route('employee') ? 'prohibited' : 'required', ...$password], 'pin' => [$this->route('employee') ? 'prohibited' : 'nullable', 'regex:/^[0-9]{6}$/']];
    }
}
