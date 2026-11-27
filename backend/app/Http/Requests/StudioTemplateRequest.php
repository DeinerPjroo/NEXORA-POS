<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StudioTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('studio.view') && $this->user()->hasPermission('studio.edit');
    }

    public function rules(): array
    {
        $create = $this->input('action') === 'create';

        return [
            'tenant_id' => ['prohibited'], 'surface' => ['prohibited'],
            'action' => ['required', Rule::in(['create', 'duplicate', 'rename'])],
            'name' => ['required', 'string', 'max:80', 'regex:/\S/u'],
            'idempotency_key' => ['required', 'uuid'],
            'template_id' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'revision' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'configuration' => [$create ? 'required' : 'prohibited', 'array'],
        ];
    }
}
