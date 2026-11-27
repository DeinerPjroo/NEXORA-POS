<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class KitchenTicket extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['order_snapshot' => 'array', 'display_snapshot' => 'array', 'revision' => 'integer', 'priority' => 'integer', 'target_minutes' => 'integer', 'started_at' => 'datetime', 'ready_at' => 'datetime', 'delivered_at' => 'datetime'];
    }

    public function lines()
    {
        return $this->hasMany(KitchenTicketLine::class);
    }

    public function events()
    {
        return $this->hasMany(KitchenTicketEvent::class)->orderBy('id');
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
