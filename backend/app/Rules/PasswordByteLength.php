<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

// bcrypt admite hasta 72 bytes. La regla max de cadenas mide caracteres.
final class PasswordByteLength implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && strlen($value) > 72) {
            $fail('La contraseña excede el tamaño permitido. Reduce su longitud o la cantidad de símbolos y emojis.');
        }
    }
}
