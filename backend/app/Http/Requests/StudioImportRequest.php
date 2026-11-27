<?php

namespace App\Http\Requests;

use App\Domains\Studio\LayoutScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StudioImportRequest extends FormRequest
{
    use StudioSurfaceData;

    public function authorize(): bool
    {
        return $this->user()->hasPermission('studio.view') && $this->user()->hasPermission('studio.edit');
    }

    public function rules(): array
    {
        return ['tenant_id' => ['prohibited'], 'surface' => ['prohibited'], 'branch_id' => ['prohibited'], 'role_id' => ['nullable', 'integer', 'min:1'], 'device' => ['sometimes', Rule::in(LayoutScope::DEVICES)], 'revision' => ['required', 'integer', 'min:0'], 'idempotency_key' => ['required', 'uuid'],
            'envelope' => ['required', 'array:format,version,surface,configuration', function ($attribute, $value, $fail) {
                $json = json_encode($value);
                if ($json === false || strlen($json) > 65536) {
                    $fail('El diseño supera el tamaño permitido.');
                }
            }],
            'envelope.format' => ['required', 'in:nexora-studio'], 'envelope.version' => ['required', 'integer', 'in:1'], 'envelope.surface' => ['required', Rule::in([$this->route('studio_surface', 'pos')])], 'envelope.configuration' => ['required', 'array']];
    }
}
