<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class SaleAccount extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    public $timestamps = false;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['number' => 'integer', 'amount' => 'decimal:4', 'created_at' => 'datetime'];
    }
}
