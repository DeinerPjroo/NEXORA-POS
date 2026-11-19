<?php

namespace App\Http\Requests;

use App\Rules\PasswordByteLength;
use Illuminate\Foundation\Http\FormRequest;

final class ConfigurePinRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return ['current_password' => ['required', 'string', 'max:72', new PasswordByteLength],
            'pin' => ['present', 'nullable', 'string', 'regex:/^[0-9]{6}$/D', 'confirmed'],
            'revision' => ['required', 'integer', 'min:1'], 'tenant_id' => ['prohibited'], 'user_id' => ['prohibited']];
    }
}
