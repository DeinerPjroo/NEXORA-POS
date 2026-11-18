<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class ProductContextPrice extends Model
{
    use BelongsToTenant;

    protected $fillable = ['amount', 'is_active'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:4', 'is_active' => 'boolean', 'revision' => 'integer', 'variant_id' => 'integer', 'branch_id' => 'integer', 'variant_scope' => 'integer', 'branch_scope' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
