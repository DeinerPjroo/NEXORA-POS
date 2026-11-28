<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

final class Payment extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    public $timestamps = false;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:4', 'received_amount' => 'decimal:4', 'change_amount' => 'decimal:4', 'created_at' => 'datetime'];
    }

    public function courierCollection(): HasOne
    {
        return $this->hasOne(CourierCollection::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(SaleAccount::class, 'account_id');
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(SaleRefund::class)->orderBy('id');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(PaymentReview::class);
    }

    public function latestReview(): HasOne
    {
        return $this->hasOne(PaymentReview::class)->latestOfMany();
    }
}
