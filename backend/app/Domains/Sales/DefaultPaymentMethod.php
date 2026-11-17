<?php

namespace App\Domains\Sales;

use App\Models\PaymentMethod;

final class DefaultPaymentMethod
{
    public static function create(): void
    {
        $method = new PaymentMethod(['code' => 'cash', 'name' => 'Efectivo', 'kind' => 'cash', 'is_active' => true]);
        $method->is_system = true;
        $method->revision = 1;
        $method->save();
    }
}
