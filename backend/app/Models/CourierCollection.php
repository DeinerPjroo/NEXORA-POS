<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class CourierCollection extends Model
{
    use AppendOnly, BelongsToTenant;

    public $timestamps = false;

    protected $guarded = ['id', 'tenant_id'];

    public function payment()
    {
        return $this->belongsTo(Payment::class);
    }

    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    public function courier()
    {
        return $this->belongsTo(User::class, 'courier_id');
    }

    public function settlements()
    {
        return $this->hasMany(CourierSettlement::class);
    }

    public function pending(): string
    {
        $paid = '0.0000';
        foreach ($this->settlements as $settlement) {
            $paid = bcadd($paid, $settlement->amount, 4);
        }
        foreach ($this->custodyRefunds as $refund) {
            $paid = bcadd($paid, $refund->amount, 4);
        }

        return bcsub($this->payment->amount, $paid, 4);
    }

    public function custodyRefunds()
    {
        return $this->hasMany(SaleRefund::class, 'courier_collection_id');
    }

    public function revision(): int
    {
        return $this->settlements->count() + $this->custodyRefunds->count() + 1;
    }
}
