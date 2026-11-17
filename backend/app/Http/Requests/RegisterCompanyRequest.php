<?php

namespace App\Http\Requests;

use App\Rules\PasswordByteLength;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

final class RegisterCompanyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['email' => strtolower(trim((string) $this->input('email')))]);
    }

    public function rules(): array
    {
        return [
            'company_name' => ['required', 'string', 'max:120'],
            'business_type' => ['required', Rule::in(['restaurant', 'pizzeria', 'cafe', 'fast_food', 'bar', 'bakery', 'other'])],
            'branch_name' => ['required', 'string', 'max:100'],
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', 'max:72', 'confirmed', new PasswordByteLength, Password::min(12)->mixedCase()->numbers()],
            'tenant_id' => ['prohibited'], 'role_id' => ['prohibited'],
        ];
    }
}
