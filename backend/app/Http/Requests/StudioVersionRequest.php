<?php

namespace App\Http\Requests;

use App\Domains\Studio\LayoutScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StudioVersionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('studio.view') && $this->user()->hasPermission('studio.edit');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'role_id' => ['nullable', 'integer', 'min:1'], 'device' => ['sometimes', Rule::in(LayoutScope::DEVICES)], 'branch_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'], 'version_id' => ['required', 'integer', 'min:1'], 'reason' => ['required', 'string', 'min:3', 'max:300']];
    }
}
