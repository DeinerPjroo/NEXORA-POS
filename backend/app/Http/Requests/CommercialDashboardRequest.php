<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CommercialDashboardRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dashboard.view');
    }

    public function rules(): array
    {
        return ['branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)], 'from' => ['nullable', 'date_format:Y-m-d'], 'to' => ['nullable', 'date_format:Y-m-d'], 'tenant_id' => ['prohibited']];
    }
}
