<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class MfaChallengeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['method' => ['required', 'in:totp,recovery'], 'credential' => ['required', 'string', 'max:72'],
            'user_id' => ['prohibited'], 'tenant_id' => ['prohibited']];
    }
}
