<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class KitchenStation extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'color', 'target_minutes', 'is_active'];

    protected function casts(): array
    {
        return ['branch_id' => 'integer', 'target_minutes' => 'integer', 'revision' => 'integer', 'is_active' => 'boolean'];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
