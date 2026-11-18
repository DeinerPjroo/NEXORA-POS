<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class ProductComboGroup extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'min_select', 'max_select', 'position', 'is_active'];

    protected function casts(): array
    {
        return ['product_id' => 'integer', 'min_select' => 'integer', 'max_select' => 'integer', 'position' => 'integer', 'is_active' => 'boolean', 'revision' => 'integer'];
    }
}
