<?php

namespace App\Http\Requests;

use App\Rules\PasswordByteLength;
use Illuminate\Foundation\Http\FormRequest;

final class MultiFactorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $rules = ['current_password' => ['required', 'string', 'max:72', new PasswordByteLength],
            'revision' => ['required', 'integer', 'min:1'], 'tenant_id' => ['prohibited'], 'user_id' => ['prohibited']];
        if ($this->route()->getActionMethod() !== 'begin') {
            $rules['credential'] = ['required', 'string', 'max:72'];
        }
        if ($this->route()->getActionMethod() === 'enable') {
            $rules['pending_id'] = ['required', 'uuid'];
            $rules['credential'][] = 'regex:/^[0-9]{6}$/D';
        } elseif ($this->route()->getActionMethod() !== 'begin') {
            $rules['method'] = ['required', 'in:totp,recovery'];
        }

        return $rules;
    }
}
