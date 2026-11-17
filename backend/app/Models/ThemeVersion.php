<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class ThemeVersion extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['version', 'schema_version', 'theme', 'created_at'];

    protected function casts(): array
    {
        return ['theme' => 'array', 'created_at' => 'datetime'];
    }
}
