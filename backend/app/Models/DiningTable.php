<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class DiningTable extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'shape', 'color', 'capacity', 'is_active'];

    public function room(): BelongsTo
    {
        return $this->belongsTo(DiningRoom::class, 'dining_room_id');
    }

    protected function casts(): array
    {
        return ['branch_id' => 'integer', 'dining_room_id' => 'integer', 'capacity' => 'integer', 'x' => 'integer', 'y' => 'integer', 'width' => 'integer', 'height' => 'integer', 'rotation' => 'integer', 'revision' => 'integer', 'is_active' => 'boolean'];
    }
}
