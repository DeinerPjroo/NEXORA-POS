<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class StudioLayout extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    public function versions(): HasMany
    {
        return $this->hasMany(StudioLayoutVersion::class);
    }

    protected function casts(): array
    {
        return ['draft' => 'array', 'published' => 'array', 'revision' => 'integer', 'draft_revision' => 'integer', 'published_revision' => 'integer', 'published_at' => 'datetime'];
    }
}
