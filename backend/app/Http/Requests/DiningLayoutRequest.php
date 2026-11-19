<?php

namespace App\Http\Requests;

use App\Domains\Dining\LayoutGeometry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class DiningLayoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('dining.manage');
    }

    public function rules(): array
    {
        return [
            'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'],
            'schema_version' => ['required', 'integer', Rule::in([1])], 'tenant_id' => ['prohibited'],
            'tables' => ['present', 'array', 'list', 'max:48'],
            'tables.*' => ['required', 'array:id,x,y,width,height,rotation'],
            'tables.*.id' => ['required', 'integer', 'min:1', 'distinct:strict'],
            ...LayoutGeometry::rules('tables.*.', true),
            'objects' => ['present', 'array', 'list', 'max:100'],
            'objects.*' => ['required', 'array:id,kind,label,color,x,y,width,height,rotation'],
            'objects.*.id' => ['required', 'uuid', 'distinct:ignore_case'],
            'objects.*.kind' => ['required', Rule::in(['wall', 'door', 'divider', 'decoration'])],
            'objects.*.label' => ['present', 'string', 'max:80'],
            'objects.*.color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/D'],
            ...LayoutGeometry::rules('objects.*.'),
        ];
    }
}
