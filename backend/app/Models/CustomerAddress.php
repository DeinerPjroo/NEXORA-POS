<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class CustomerAddress extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected $hidden = ['tenant_id'];

    protected function casts(): array
    {
        return ['revision' => 'integer', 'is_active' => 'boolean'];
    }
}
