<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

final class GalleryUploadRequest extends ProductImageRequest
{
    public function rules(): array
    {
        $rules = parent::rules();
        unset($rules['revision']);

        return [...$rules, 'idempotency_key' => ['required', 'uuid'], 'product_revision' => ['required', 'integer', 'min:1'],
            'currency' => ['required', Rule::in(['COP', 'USD', 'EUR'])], 'make_cover' => ['sometimes', 'boolean'], 'file_hash' => ['prohibited'], 'revision' => ['prohibited']];
    }
}
