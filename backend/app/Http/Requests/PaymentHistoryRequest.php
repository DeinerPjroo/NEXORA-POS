<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class PaymentHistoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('sales.view');
    }

    public function rules(): array
    {
        return ['branch_id' => ['sometimes', 'nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $this->user()->tenant_id)],
            'method_kind' => ['sometimes', 'nullable', Rule::in(['cash', 'non_cash'])], 'reference' => ['sometimes', 'nullable', 'string', 'max:120'],
            'review_status' => ['sometimes', 'nullable', Rule::in(['pending', 'matched', 'difference', 'stale'])],
            'from' => ['sometimes', 'nullable', 'date_format:Y-m-d'], 'to' => ['sometimes', 'nullable', 'date_format:Y-m-d', Rule::when(fn () => filled($this->input('from')), ['after_or_equal:from'])],
            'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,50'], 'tenant_id' => ['prohibited']];
    }
}
