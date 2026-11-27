<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class KitchenPriorityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('kitchen.view') && $this->user()->can('kitchen.operate');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'],
            'revision' => ['required', 'integer', 'min:1'], 'priority' => ['required', 'integer', Rule::in([0, 1])],
            'reason' => ['required', 'string', 'min:3', 'max:200']];
    }
}
