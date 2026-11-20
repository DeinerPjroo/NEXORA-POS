<?php

namespace App\Http\Requests;

use App\Domains\Operations\Money;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ContextPriceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return ['idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])], 'amount' => ['required', ...Money::rules()], 'is_active' => ['required', 'boolean'],
            'revision' => [$creating ? 'prohibited' : 'required', 'integer', 'min:1'],
            'variant_id' => [$creating ? 'sometimes' : 'prohibited', 'nullable', 'integer', Rule::exists('product_variants', 'id')->where('tenant_id', $this->user()->tenant_id)->where('product_id', $this->route('product')->id)],
            'branch_id' => [$creating ? 'sometimes' : 'prohibited', 'nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'channel' => [$creating ? 'required' : 'prohibited', Rule::in(['all', 'takeaway', 'dine_in', 'delivery'])],
            'tenant_id' => ['prohibited'], 'product_id' => ['prohibited'], 'variant_scope' => ['prohibited'], 'branch_scope' => ['prohibited']];
    }
}
