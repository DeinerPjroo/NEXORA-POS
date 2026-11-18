<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class AvailabilityWindowRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'],
            'expected_timezone' => ['required', 'timezone'],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])], 'revision' => [$this->isMethod('POST') ? 'prohibited' : 'required', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:80'], 'weekday' => ['required', 'integer', 'between:1,7'],
            'start_time' => ['required', 'date_format:H:i'], 'end_time' => ['required', 'date_format:H:i'],
            'ends_next_day' => ['required', 'boolean'], 'is_active' => ['required', 'boolean'],
            'valid_from' => ['nullable', 'date_format:Y-m-d'], 'valid_until' => ['nullable', 'date_format:Y-m-d'],
            'tenant_id' => ['prohibited'], 'product_id' => ['prohibited'], 'variant_id' => ['prohibited']];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }
            $overnight = $this->boolean('ends_next_day');
            if ($overnight ? $this->input('end_time') > $this->input('start_time') : $this->input('end_time') <= $this->input('start_time')) {
                $validator->errors()->add('end_time', $overnight ? 'Al terminar al día siguiente, la hora final debe ser menor o igual a la inicial; igualdad indica 24 horas.' : 'La hora final debe ser posterior a la inicial. Marca día siguiente si cruza medianoche.');
            }
            if ($this->filled('valid_from') && $this->filled('valid_until') && $this->input('valid_until') < $this->input('valid_from')) {
                $validator->errors()->add('valid_until', 'La vigencia final no puede ser anterior a la inicial.');
            }
        }];
    }
}
