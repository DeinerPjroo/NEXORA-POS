<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class AuditLog extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['actor_id', 'action', 'description', 'ip_address', 'metadata', 'created_at'];

    protected function casts(): array
    {
        return ['metadata' => 'array', 'created_at' => 'datetime'];
    }
}
