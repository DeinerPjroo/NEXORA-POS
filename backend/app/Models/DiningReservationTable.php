<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class DiningReservationTable extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id', 'current_table'];

    public function table(): BelongsTo
    {
        return $this->belongsTo(DiningTable::class, 'dining_table_id');
    }

    protected function casts(): array
    {
        return ['dining_table_id' => 'integer', 'is_active' => 'boolean'];
    }
}
