<?php

namespace App\Http\Requests;

use App\Rules\PasswordByteLength;
use Illuminate\Foundation\Http\FormRequest;

final class UnlockScreenRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return ['challenge' => ['required', 'uuid'], 'method' => ['required', 'in:pin,password'],
            'credential' => ['required', 'string', 'max:72', ...($this->input('method') === 'pin' ? ['regex:/^[0-9]{6}$/D'] : [new PasswordByteLength])],
            'tenant_id' => ['prohibited'], 'user_id' => ['prohibited']];
    }
}
