<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class SalesSetting extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['tip_tax_snapshot' => 'array', 'configured' => 'boolean', 'tip_enabled' => 'boolean', 'revision' => 'integer', 'tax_rate' => 'decimal:4'];
    }
}
