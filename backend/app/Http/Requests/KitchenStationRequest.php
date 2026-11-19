<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class KitchenStationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('kitchen.manage');
    }

    public function rules(): array
    {
        $create = $this->isMethod('POST');

        return ['idempotency_key' => ['required', 'uuid'], 'tenant_id' => ['prohibited'],
            'revision' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'branch_id' => [$create ? 'required' : 'prohibited', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'name' => ['required', 'string', 'max:80'], 'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/D'],
            'target_minutes' => ['required', 'integer', 'between:1,1440'], 'is_active' => ['required', 'boolean']];
    }
}
