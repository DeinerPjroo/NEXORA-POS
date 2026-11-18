<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class Product extends Model
{
    use BelongsToTenant;

    protected $fillable = ['category_id', 'tax_profile_id', 'name', 'sku', 'barcode', 'description', 'sale_price', 'cost_price', 'is_active', 'is_available'];

    protected $hidden = ['cost_price', 'image_path', 'image_mime'];

    protected function casts(): array
    {
        return ['sale_price' => 'decimal:4', 'cost_price' => 'decimal:4', 'is_active' => 'boolean', 'is_available' => 'boolean', 'revision' => 'integer'];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class);
    }

    public function taxProfile(): BelongsTo
    {
        return $this->belongsTo(TaxProfile::class);
    }

    public function modifierGroups(): HasMany
    {
        return $this->hasMany(ProductModifierGroup::class);
    }

    public function scopeWithCatalogCounts(Builder $query): void
    {
        $query->withCount(['variants', 'variants as available_variants_count' => fn ($q) => $q->where('is_active', true)->where('is_available', true), 'modifierGroups as modifier_groups_count' => fn ($q) => $q->where('is_active', true)]);
    }
}
