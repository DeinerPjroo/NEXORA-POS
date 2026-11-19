<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class ProductImage extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id', 'product_id', 'path', 'mime'];

    protected $hidden = ['path'];

    protected function casts(): array
    {
        return ['product_id' => 'integer', 'position' => 'integer', 'is_active' => 'boolean'];
    }
}
