<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProductImageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('product'));
    }

    public function rules(): array
    {
        return [
            'revision' => ['required', 'integer', 'min:1'],
            'image' => [$this->isMethod('DELETE') ? 'prohibited' : 'required', 'file', 'mimes:jpg,jpeg,png,webp', 'mimetypes:image/jpeg,image/png,image/webp', 'max:2048', Rule::dimensions()->minWidth(32)->minHeight(32)->maxWidth(2048)->maxHeight(2048)],
            'tenant_id' => ['prohibited'], 'image_path' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return ['image.mimes' => 'Usa una imagen JPEG, PNG o WebP.', 'image.mimetypes' => 'Usa una imagen JPEG, PNG o WebP.', 'image.max' => 'La imagen debe pesar hasta 2 MB.', 'image.dimensions' => 'La imagen debe medir entre 32 y 2048 píxeles por lado.'];
    }
}
