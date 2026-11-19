<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DiningReservationStateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.reserve') && ($this->input('status') !== 'arrived' || $this->user()->can('dining.operate'));
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'], 'status' => ['required', Rule::in(['arrived', 'cancelled', 'no_show'])], 'waiter_id' => [$this->input('status') === 'arrived' ? 'present' : 'prohibited', 'nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $this->user()->tenant_id)], 'tenant_id' => ['prohibited']];
    }
}
