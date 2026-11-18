<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class ProductAvailabilityWindow extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'weekday', 'start_time', 'end_time', 'ends_next_day', 'valid_from', 'valid_until', 'is_active'];

    protected function casts(): array
    {
        return ['product_id' => 'integer', 'weekday' => 'integer', 'ends_next_day' => 'boolean', 'is_active' => 'boolean', 'revision' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
