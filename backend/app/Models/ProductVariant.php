<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class ProductVariant extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'sku', 'barcode', 'sale_price', 'cost_price', 'is_active', 'is_available'];

    protected $hidden = ['cost_price'];

    protected function casts(): array
    {
        return ['sale_price' => 'decimal:4', 'cost_price' => 'decimal:4', 'is_active' => 'boolean', 'is_available' => 'boolean'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
