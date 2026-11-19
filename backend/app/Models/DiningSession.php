<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use App\Domains\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class DiningSession extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['branch_id' => 'integer', 'waiter_id' => 'integer', 'guest_count' => 'integer', 'revision' => 'integer', 'opened_at' => 'datetime', 'closed_at' => 'datetime'];
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(DiningSessionTable::class);
    }

    public function waiter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'waiter_id')->where('users.tenant_id', app(TenantContext::class)->id());
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(DiningEvent::class);
    }
}
