<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class PreparationCorrectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.manage') && $this->user()->can('orders.view');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'order_revision' => ['required', 'integer', 'min:1'], 'item_ids' => ['required', 'array', 'list', 'min:1', 'max:100'], 'item_ids.*' => ['required', 'integer', 'distinct', 'min:1'], 'destination' => ['required', 'in:table,takeaway'], 'reason' => ['required', 'string', 'min:3', 'max:250']];
    }
}
