<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DiningRoomRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.manage');
    }

    public function rules(): array
    {
        $create = $this->isMethod('POST');

        return [
            'idempotency_key' => ['required', 'uuid'],
            'revision' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'branch_id' => [$create ? 'required' : 'prohibited', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'name' => ['required', 'string', 'max:80'], 'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/D'],
            'is_active' => ['required', 'boolean'], 'tenant_id' => ['prohibited'],
        ];
    }
}
