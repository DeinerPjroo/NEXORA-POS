<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DiningReservationFiltersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.reserve');
    }

    public function rules(): array
    {
        return ['branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)], 'status' => ['nullable', Rule::in(['booked', 'arrived', 'cancelled', 'no_show'])], 'date' => ['nullable', 'date_format:Y-m-d'], 'search' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,50']];
    }
}
