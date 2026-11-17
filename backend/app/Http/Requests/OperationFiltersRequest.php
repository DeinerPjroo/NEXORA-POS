<?php

namespace App\Http\Requests;

use App\Domains\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class OperationFiltersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission($this->is('api/v1/cash/*') ? 'cash.view' : 'orders.view');
    }

    public function rules(): array
    {
        return [
            'branch_id' => ['sometimes', 'integer', Rule::exists('branches', 'id')->where('tenant_id', app(TenantContext::class)->id())],
            'status' => ['sometimes', Rule::in($this->is('api/v1/cash/*') ? ['open', 'closed'] : ['open', 'preparing', 'ready', 'delivered', 'cancelled'])],
            'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ];
    }
}
