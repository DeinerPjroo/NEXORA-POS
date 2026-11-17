<?php

namespace App\Domains\Cash;

use App\Models\Branch;
use App\Models\CashRegister;

final class DefaultRegister
{
    public static function create(Branch $branch): CashRegister
    {
        return CashRegister::create(['branch_id' => $branch->id, 'name' => 'Caja principal', 'code' => 'PRINCIPAL', 'is_active' => true]);
    }
}
