<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class DiningRoom extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'color', 'is_active'];

    protected function casts(): array
    {
        return ['branch_id' => 'integer', 'revision' => 'integer', 'is_active' => 'boolean', 'layout_schema_version' => 'integer', 'objects' => 'array'];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function diningTables(): HasMany
    {
        return $this->hasMany(DiningTable::class);
    }
}
