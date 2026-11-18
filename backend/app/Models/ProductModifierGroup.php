<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class ProductModifierGroup extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'min_select', 'max_select', 'is_active', 'position'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'revision' => 'integer', 'min_select' => 'integer', 'max_select' => 'integer', 'position' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function options(): HasMany
    {
        return $this->hasMany(ProductModifierOption::class, 'modifier_group_id');
    }
}
