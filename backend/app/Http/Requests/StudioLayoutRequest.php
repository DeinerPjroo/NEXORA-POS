<?php

namespace App\Http\Requests;

use App\Domains\Studio\LayoutScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StudioLayoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('studio.view') && $this->user()->hasPermission($this->is('api/v1/studio/pos/publish') ? 'studio.publish' : 'studio.edit');
    }

    public function rules(): array
    {
        $publishing = $this->is('api/v1/studio/pos/publish');

        return ['tenant_id' => ['prohibited'], 'role_id' => ['nullable', 'integer', 'min:1'], 'device' => ['sometimes', Rule::in(LayoutScope::DEVICES)], 'branch_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', $publishing ? 'min:1' : 'min:0'], 'configuration' => [$publishing ? 'prohibited' : 'required', 'array']];
    }
}
