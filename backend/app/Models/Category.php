<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class Category extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'description', 'color', 'is_active', 'parent_id'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'revision' => 'integer', 'parent_id' => 'integer'];
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function isEffectivelyActive(): bool
    {
        return $this->is_active && (! $this->parent_id || (bool) $this->parent?->is_active);
    }

    public function summary(): array
    {
        return [...$this->only('id', 'name', 'color', 'is_active', 'revision', 'parent_id'),
            'parent' => $this->parent?->only('id', 'name', 'color', 'is_active', 'revision'),
            'effective_active' => $this->isEffectivelyActive()];
    }
}
