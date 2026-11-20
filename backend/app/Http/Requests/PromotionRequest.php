<?php

namespace App\Http\Requests;

use App\Domains\Operations\Money;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class PromotionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        $create = $this->isMethod('POST');

        return ['idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'], 'expected_timezone' => ['required', 'timezone'],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])], 'revision' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:80'], 'discount_type' => ['required', Rule::in(['fixed', 'percentage'])],
            'discount_value' => ['required', ...($this->input('discount_type') === 'percentage' ? ['string', 'regex:/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/D', 'numeric', 'between:0,100'] : Money::rules())],
            'priority' => ['required', 'integer', 'between:0,999'], 'valid_from' => ['nullable', 'date_format:Y-m-d'], 'valid_until' => ['nullable', 'date_format:Y-m-d'], 'is_active' => ['required', 'boolean'],
            'variant_id' => [$create ? 'sometimes' : 'prohibited', 'nullable', 'integer', Rule::exists('product_variants', 'id')->where('tenant_id', $this->user()->tenant_id)->where('product_id', $this->route('product')->id)],
            'branch_id' => [$create ? 'sometimes' : 'prohibited', 'nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'channel' => [$create ? 'required' : 'prohibited', Rule::in(['all', 'takeaway', 'dine_in', 'delivery'])], 'tenant_id' => ['prohibited'], 'product_id' => ['prohibited']];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            if ($validator->errors()->isEmpty() && $this->filled('valid_from') && $this->filled('valid_until') && $this->input('valid_until') < $this->input('valid_from')) {
                $validator->errors()->add('valid_until', 'La vigencia final no puede ser anterior a la inicial.');
            }
        }];
    }
}
