<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class StudioLayout extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['draft' => 'array', 'published' => 'array', 'revision' => 'integer', 'published_revision' => 'integer', 'published_at' => 'datetime'];
    }
}
