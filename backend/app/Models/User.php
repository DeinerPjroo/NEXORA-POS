<?php

namespace App\Models;

use App\Domains\Tenancy\TenantContext;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'pin_hash', 'mfa_secret', 'mfa_recovery_hashes', 'mfa_last_step', 'mfa_pending_secret', 'mfa_pending_id', 'mfa_pending_expires_at'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'security_revision' => 'integer',
            'mfa_secret' => 'encrypted',
            'mfa_pending_secret' => 'encrypted',
            'mfa_recovery_hashes' => 'encrypted:array',
            'mfa_enabled_at' => 'immutable_datetime',
            'mfa_pending_expires_at' => 'immutable_datetime',
            'mfa_last_step' => 'integer',
            'mfa_version' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function hasPermission(string $key): bool
    {
        return $this->is_active && (int) $this->tenant_id === app(TenantContext::class)->id()
            && $this->role?->permissions->contains('key', $key);
    }
}
