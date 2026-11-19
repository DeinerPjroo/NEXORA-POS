<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class VerificationNotificationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return ['email' => ['prohibited'], 'user_id' => ['prohibited'], 'tenant_id' => ['prohibited']];
    }
}
