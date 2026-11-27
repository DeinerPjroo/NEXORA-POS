<?php

namespace App\Http\Requests;

use App\Domains\Studio\LayoutScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StudioScopeRequest extends FormRequest
{
    use StudioSurfaceData;

    public function authorize(): bool
    {
        return $this->user()->hasPermission('studio.view');
    }

    public function rules(): array
    {
        return ['surface' => ['prohibited'], 'role_id' => ['nullable', 'integer', 'min:1'], 'device' => ['sometimes', Rule::in(LayoutScope::DEVICES)], 'branch_id' => ['prohibited'], 'page' => ['sometimes', 'integer', 'min:1'], 'archived' => ['sometimes', 'boolean']];
    }
}
