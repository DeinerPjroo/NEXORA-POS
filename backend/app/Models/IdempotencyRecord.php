<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class IdempotencyRecord extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['key', 'actor_id', 'action', 'request_hash', 'resource_type', 'resource_id', 'created_at'];
}
