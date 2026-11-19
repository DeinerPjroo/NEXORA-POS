<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class DiningTable extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'shape', 'color', 'capacity', 'is_active'];

    protected function casts(): array
    {
        return ['branch_id' => 'integer', 'dining_room_id' => 'integer', 'capacity' => 'integer', 'x' => 'integer', 'y' => 'integer', 'width' => 'integer', 'height' => 'integer', 'rotation' => 'integer', 'revision' => 'integer', 'is_active' => 'boolean'];
    }
}
