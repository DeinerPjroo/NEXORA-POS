<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CompanyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'business_type' => ['required', Rule::in(['restaurant', 'pizzeria', 'cafe', 'fast_food', 'bar', 'bakery', 'other'])],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'timezone' => ['required', 'timezone'],
            'locale' => ['required', Rule::in(['es-CO'])],
            'status' => ['prohibited'], 'tenant_id' => ['prohibited'], 'public_id' => ['prohibited'],
        ];
    }
}
