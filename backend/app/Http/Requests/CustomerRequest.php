<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class CustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('customers.manage') && $this->user()->can('customers.view');
    }

    public function rules(): array
    {
        $rules = ['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'branch_id' => [$this->isMethod('POST') ? 'required' : 'prohibited', 'integer', 'min:1'], 'revision' => [$this->isMethod('PUT') ? 'required' : 'prohibited', 'integer', 'min:1'], 'name' => ['required', 'string', 'max:100'], 'phone' => ['required', 'string', 'min:3', 'max:30'], 'is_active' => ['sometimes', 'boolean'], 'initial_address' => [$this->isMethod('PUT') ? 'prohibited' : 'sometimes', 'array:label,recipient_name,phone,address,neighborhood,location_reference,instructions,is_active']];
        foreach (CustomerAddressRequest::fields() as $key => $field) {
            $rules['initial_address.'.$key] = array_map(fn ($r) => $r === 'required' ? 'required_with:initial_address' : $r, $field);
        }

        return $rules;
    }
}
