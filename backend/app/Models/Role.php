<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

final class Role extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name'];

    protected function casts(): array
    {
        return ['is_owner' => 'boolean', 'revision' => 'integer'];
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permission')->withPivot('tenant_id');
    }
}
