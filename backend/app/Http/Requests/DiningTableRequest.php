<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DiningTableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.manage');
    }

    public function rules(): array
    {
        return [
            'idempotency_key' => ['required', 'uuid'], 'room_revision' => ['required', 'integer', 'min:1'],
            'revision' => [$this->isMethod('POST') ? 'prohibited' : 'required', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:50'], 'shape' => ['required', Rule::in(['circle', 'square', 'rectangle'])],
            'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/D'], 'capacity' => ['required', 'integer', 'between:1,30'],
            'is_active' => ['required', 'boolean'], 'tenant_id' => ['prohibited'], 'branch_id' => ['prohibited'], 'dining_room_id' => ['prohibited'],
            'x' => ['prohibited'], 'y' => ['prohibited'], 'width' => ['prohibited'], 'height' => ['prohibited'], 'rotation' => ['prohibited'],
        ];
    }
}
