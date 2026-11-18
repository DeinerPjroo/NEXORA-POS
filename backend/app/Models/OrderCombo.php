<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class OrderCombo extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'quantity' => 'integer', 'unit_price' => 'decimal:4', 'line_subtotal' => 'decimal:4'];
    }
}
