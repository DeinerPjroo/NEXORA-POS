<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class KitchenRoute extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['revision' => 'integer', 'is_active' => 'boolean'];
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function station()
    {
        return $this->belongsTo(KitchenStation::class, 'kitchen_station_id');
    }
}
