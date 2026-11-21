<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use LogicException;

final class Sale extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected static function booted(): void
    {
        self::updating(function ($sale) {
            if (array_diff(array_keys($sale->getDirty()), ['status', 'revision', 'updated_at'])) {
                throw new LogicException('Los importes históricos de una venta no se modifican.');
            }
        });
        self::deleting(fn () => throw new LogicException('Las ventas no se eliminan.'));
    }

    protected function casts(): array
    {
        return ['delivery_charge' => 'array', 'tax_breakdown' => 'array', 'revision' => 'integer', 'calculation_version' => 'integer', 'tip_confirmed' => 'boolean', ...array_fill_keys(['catalog_subtotal', 'subtotal', 'rounding_adjustment', 'discount_amount', 'discount_value', 'tip_amount', 'taxable_base', 'tax_rate', 'tax_amount', 'delivery_fee_total', 'total'], 'decimal:4')];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function payment(): HasOne
    {
        return $this->hasOne(Payment::class)->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderBy('id');
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(SaleRefund::class)->orderBy('id');
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(SaleAccount::class)->orderBy('number');
    }

    public function refund(): HasOne
    {
        return $this->hasOne(SaleRefund::class)->orderBy('id');
    }
}
