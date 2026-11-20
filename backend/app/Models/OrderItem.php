<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class OrderItem extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    public function preparationCorrections(): HasMany
    {
        return $this->hasMany(PreparationCorrection::class)->orderBy('id');
    }

    public function destination(string $channel): string
    {
        return $this->preparationCorrections->last()?->to_destination ?? $this->preparation_destination ?? ($channel === 'dine_in' ? 'table' : 'takeaway');
    }

    protected function casts(): array
    {
        return ['tax_snapshot' => 'array', 'modifiers_snapshot' => 'array', 'price_snapshot' => 'array', 'availability_snapshot' => 'array', 'base_unit_price' => 'decimal:4', 'quantity' => 'integer', 'unit_price' => 'decimal:4', 'line_subtotal' => 'decimal:4'];
    }
}
