<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class KitchenTicketLine extends Model
{
    use AppendOnly, BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    public function preparationCorrections(): \Illuminate\Database\Eloquent\Relations\HasMany { return $this->hasMany(PreparationCorrection::class,'order_item_id','order_item_id')->orderBy('id'); }

    protected function casts(): array
    {
        return ['snapshot' => 'array'];
    }
}
