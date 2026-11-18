<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class ProductComboComponent extends Model
{
    use BelongsToTenant;

    protected $fillable = ['units', 'position', 'is_active'];

    protected function casts(): array
    {
        return ['product_id' => 'integer', 'component_product_id' => 'integer', 'component_variant_id' => 'integer', 'units' => 'integer', 'position' => 'integer', 'is_active' => 'boolean', 'revision' => 'integer'];
    }

    public function componentProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'component_product_id');
    }

    public function componentVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'component_variant_id');
    }
}
