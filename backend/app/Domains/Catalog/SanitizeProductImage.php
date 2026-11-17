<?php

namespace App\Domains\Catalog;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

final class SanitizeProductImage
{
    public function encode(UploadedFile $file): array
    {
        $source = @imagecreatefromstring(file_get_contents($file->getRealPath()));
        if ($source === false) {
            throw ValidationException::withMessages(['image' => 'La imagen no se puede leer. Selecciona otro archivo.']);
        }
        $mime = $file->getMimeType();
        ob_start();
        try {
            imagepalettetotruecolor($source);
            imagesavealpha($source, true);
            $ok = match ($mime) {
                'image/jpeg' => imagejpeg($source, null, 88),
                'image/png' => imagepng($source, null, 7),
                'image/webp' => imagewebp($source, null, 88),
                default => false,
            };
            $bytes = ob_get_contents();
        } finally {
            ob_end_clean();
            imagedestroy($source);
        }
        if (! $ok || ! $bytes) {
            throw ValidationException::withMessages(['image' => 'No se pudo preparar la imagen.']);
        }

        return ['bytes' => $bytes, 'mime' => $mime, 'extension' => match ($mime) {
            'image/jpeg' => 'jpg', 'image/png' => 'png', default => 'webp'
        }];
    }
}
