<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DiningReservationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.reserve');
    }

    public function rules(): array
    {
        $create = $this->isMethod('POST');

        return ['idempotency_key' => ['required', 'uuid'], 'revision' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'branch_id' => [$create ? 'required' : 'prohibited', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'expected_timezone' => ['required', 'timezone'], 'guest_name' => ['required', 'string', 'max:100'], 'phone' => ['nullable', 'string', 'max:30'], 'notes' => ['nullable', 'string', 'max:300'], 'guest_count' => ['required', 'integer', 'between:1,100'],
            'starts_at' => ['required', 'date_format:Y-m-d\\TH:i:sP'], 'ends_at' => ['required', 'date_format:Y-m-d\\TH:i:sP'],
            'tables' => ['required', 'array', 'list', 'min:1', 'max:20'], 'tables.*' => ['required', 'array:id,revision'], 'tables.*.id' => ['required', 'integer', 'min:1', 'distinct:strict'], 'tables.*.revision' => ['required', 'integer', 'min:1'],
            'tenant_id' => ['prohibited'], 'status' => ['prohibited'], 'dining_session_id' => ['prohibited']];
    }
}
