<?php

namespace App\Domains\Identity;

use App\Models\AuditLog;
use App\Models\User;

final class Audit
{
    public static function record(string $action, string $description, ?User $actor = null, array $metadata = []): void
    {
        AuditLog::create([
            'actor_id' => $actor?->id,
            'action' => $action,
            'description' => $description,
            'metadata' => $metadata,
            'ip_address' => request()->ip(),
            'created_at' => now(),
        ]);
    }
}
