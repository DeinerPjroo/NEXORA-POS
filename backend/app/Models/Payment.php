<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class Payment extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    public $timestamps = false;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:4', 'received_amount' => 'decimal:4', 'change_amount' => 'decimal:4', 'created_at' => 'datetime'];
    }
}
