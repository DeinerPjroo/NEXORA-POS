<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class CashMovement extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['cash_session_id', 'actor_id', 'type', 'amount', 'reason', 'created_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:4', 'created_at' => 'datetime'];
    }
}
