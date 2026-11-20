<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class KitchenTicketLine extends Model
{
    use AppendOnly, BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['snapshot' => 'array'];
    }
}
