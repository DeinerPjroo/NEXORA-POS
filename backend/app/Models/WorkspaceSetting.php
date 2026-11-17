<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class WorkspaceSetting extends Model
{
    use BelongsToTenant;

    protected $fillable = ['theme', 'revision'];

    protected function casts(): array
    {
        return ['theme' => 'array', 'revision' => 'integer'];
    }
}
