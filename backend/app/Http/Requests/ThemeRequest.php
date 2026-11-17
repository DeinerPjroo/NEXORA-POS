<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ThemeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'revision' => ['required', 'integer', 'min:1'],
            'theme' => ['required', 'array:primary,secondary,mode,radius'],
            'theme.primary' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'theme.secondary' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'theme.mode' => ['required', Rule::in(['light', 'dark'])],
            'theme.radius' => ['required', Rule::in(['rounded', 'soft'])],
            'tenant_id' => ['prohibited'],
        ];
    }
}
