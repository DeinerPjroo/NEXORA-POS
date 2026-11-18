<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class OrderItem extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['tax_snapshot' => 'array', 'modifiers_snapshot' => 'array', 'price_snapshot' => 'array', 'base_unit_price' => 'decimal:4', 'quantity' => 'integer', 'unit_price' => 'decimal:4', 'line_subtotal' => 'decimal:4'];
    }
}
