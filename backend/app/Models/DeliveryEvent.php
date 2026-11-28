<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class DeliveryEvent extends Model
{
    use AppendOnly,BelongsToTenant;

    public $timestamps = false;

    protected $guarded = ['id', 'tenant_id'];

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function courier()
    {
        return $this->belongsTo(User::class, 'courier_id');
    }

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }
}
