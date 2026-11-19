<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DiningTransferRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.operate') && $this->user()->can('orders.manage') && $this->user()->can('orders.view');
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'order_revision' => ['required', 'integer', 'min:1'], 'source_revision' => ['required', 'integer', 'min:1'], 'target_revision' => ['required', 'integer', 'min:1'], 'target_session_id' => ['required', 'integer', Rule::exists('dining_sessions', 'id')->where('tenant_id', $this->user()->tenant_id)], 'tenant_id' => ['prohibited']];
    }
}
