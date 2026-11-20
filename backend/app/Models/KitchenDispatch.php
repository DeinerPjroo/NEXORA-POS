<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class KitchenDispatch extends Model
{
    use AppendOnly, BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    public function tickets()
    {
        return $this->hasMany(KitchenTicket::class);
    }
}
