<?php

namespace App\Http\Requests;

use App\Domains\Operations\Money;
use Illuminate\Foundation\Http\FormRequest;

final class CourierCashRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('orders.manage') && $this->user()->can('orders.view') && $this->user()->can('cash.view') && $this->user()->can('cash.movements');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'branch_id' => ['required', 'integer', 'min:1'],
            'kind' => ['required', 'in:advance,return'], 'account_revision' => ['required', 'integer', 'min:0'],
            'expected_balance' => ['required', ...Money::rules()], 'amount' => ['required', 'string', 'regex:/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/D'],
            'cash_session_id' => ['required', 'integer', 'min:1'], 'cash_revision' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'min:3', 'max:250'], 'confirmed_handover' => ['required', 'accepted']];
    }
}
