<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class CustomerAddressRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('customers.manage') && $this->user()->can('customers.view');
    }

    public static function fields(): array
    {
        return ['label' => ['required', 'string', 'max:60'], 'recipient_name' => ['required', 'string', 'max:100'], 'phone' => ['required', 'string', 'min:3', 'max:30'], 'address' => ['required', 'string', 'min:5', 'max:300'], 'neighborhood' => ['nullable', 'string', 'max:100'], 'location_reference' => ['nullable', 'string', 'max:300'], 'instructions' => ['nullable', 'string', 'max:300'], 'is_active' => ['sometimes', 'boolean']];
    }

    public function rules(): array
    {
        return [...self::fields(), 'tenant_id' => ['prohibited'], 'branch_id' => ['prohibited'], 'customer_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'], 'address_revision' => [$this->isMethod('PUT') ? 'required' : 'prohibited', 'integer', 'min:1']];
    }
}
