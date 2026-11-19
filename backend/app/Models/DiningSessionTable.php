<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class DiningSessionTable extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    public function session(): BelongsTo
    {
        return $this->belongsTo(DiningSession::class, 'dining_session_id');
    }

    protected $guarded = ['id', 'tenant_id', 'occupied_table'];

    public function table(): BelongsTo
    {
        return $this->belongsTo(DiningTable::class, 'dining_table_id');
    }

    protected function casts(): array
    {
        return ['branch_id' => 'integer', 'dining_session_id' => 'integer', 'dining_table_id' => 'integer', 'joined_at' => 'datetime', 'released_at' => 'datetime'];
    }
}
