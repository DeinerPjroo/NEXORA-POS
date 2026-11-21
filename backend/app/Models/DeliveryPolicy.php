<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class DeliveryPolicy extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['revision' => 'integer', 'is_enabled' => 'boolean', 'default_fee' => 'decimal:4', 'free_from' => 'decimal:4'];
    }

    public function zones(): HasMany
    {
        return $this->hasMany(DeliveryZone::class)->orderBy('id');
    }
}
