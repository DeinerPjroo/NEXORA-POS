<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class CourierCashTransfer extends Model
{
    use AppendOnly, BelongsToTenant;

    public $timestamps = false;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:4', 'balance_after' => 'decimal:4', 'confirmed_handover' => 'boolean', 'created_at' => 'datetime'];
    }
}
