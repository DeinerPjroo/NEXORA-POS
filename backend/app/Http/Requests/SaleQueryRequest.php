<?php

namespace App\Http\Requests;

use App\Domains\Sales\SaleAdjustmentRules;
use App\Domains\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class SaleQueryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission($this->routeIs('sales.quote') ? 'sales.collect' : 'sales.view');
    }

    public function rules(): array
    {
        return $this->routeIs('sales.quote') ? SaleAdjustmentRules::rules() : [
            'branch_id' => ['sometimes', 'integer', Rule::exists('branches', 'id')->where('tenant_id', app(TenantContext::class)->id())],
            'status' => ['sometimes', Rule::in(['paid', 'partially_paid', 'refunded'])], 'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ];
    }
}
