<?php

namespace App\Models;

use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class PaymentReview extends Model
{
    use AppendOnly;
    use BelongsToTenant;

    public $timestamps = false;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['version' => 'integer', 'sale_revision' => 'integer', 'expected_net_amount' => 'decimal:4', 'observed_amount' => 'decimal:4', 'difference_amount' => 'decimal:4', 'review_confirmed' => 'boolean', 'created_at' => 'datetime'];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }
}
