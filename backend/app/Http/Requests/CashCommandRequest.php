<?php

namespace App\Http\Requests;

use App\Domains\Operations\Money;
use App\Domains\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CashCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission($this->routeIs('cash.movements.store') ? 'cash.movements' : 'cash.manage');
    }

    protected function prepareForValidation(): void
    {
        if ($this->routeIs('cash.registers.store')) {
            $this->merge(['code' => strtoupper(trim((string) $this->input('code')))]);
        }
    }

    public function rules(): array
    {
        $common = ['idempotency_key' => ['required', 'uuid'], 'tenant_id' => ['prohibited']];

        return $common + match (true) {
            $this->routeIs('cash.registers.store') => [
                'branch_id' => ['required', 'integer', Rule::exists('branches', 'id')->where('tenant_id', app(TenantContext::class)->id())],
                'name' => ['required', 'string', 'max:80'], 'code' => ['required', 'string', 'max:20', 'regex:/^[A-Z0-9_-]+$/D'],
            ],
            $this->routeIs('cash.sessions.open') => [
                'opening_amount' => ['required', ...Money::rules()], 'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            ],
            $this->routeIs('cash.movements.store') => [
                'revision' => ['required', 'integer', 'min:1'], 'type' => ['required', Rule::in(['income', 'expense'])],
                'amount' => ['required', ...Money::rules()], 'reason' => ['required', 'string', 'min:3', 'max:300'],
            ],
            default => [
                'revision' => ['required', 'integer', 'min:1'], 'counted_amount' => ['required', ...Money::rules()],
                'closing_note' => ['nullable', 'string', 'max:500'],
            ],
        };
    }
}
