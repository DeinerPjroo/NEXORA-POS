<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class DiningCloseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.operate');
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'], 'tenant_id' => ['prohibited']];
    }
}
