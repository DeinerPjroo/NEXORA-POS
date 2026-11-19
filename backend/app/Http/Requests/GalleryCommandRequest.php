<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class GalleryCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        return ['idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'], 'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])],
            'image_ids' => [$this->route()->getActionMethod() === 'order' ? 'required' : 'prohibited', 'array', 'list', 'min:1', 'max:8'], 'image_ids.*' => ['required', 'integer', 'min:1', 'distinct'],
            'tenant_id' => ['prohibited'], 'product_id' => ['prohibited'], 'cover_image_id' => ['prohibited'], 'image_path' => ['prohibited']];
    }
}
