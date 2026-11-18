<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class ProductModifierOption extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'extra_price', 'is_active', 'position'];

    protected function casts(): array
    {
        return ['extra_price' => 'decimal:4', 'is_active' => 'boolean', 'position' => 'integer'];
    }

    public function modifierGroup(): BelongsTo
    {
        return $this->belongsTo(ProductModifierGroup::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
