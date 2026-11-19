<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class ProductPromotion extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'discount_type', 'discount_value', 'priority', 'valid_from', 'valid_until', 'is_active'];

    protected function casts(): array
    {
        return ['product_id' => 'integer', 'variant_id' => 'integer', 'branch_id' => 'integer', 'discount_value' => 'decimal:4', 'priority' => 'integer', 'revision' => 'integer', 'is_active' => 'boolean'];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class);
    }
}
