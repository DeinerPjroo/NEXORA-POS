<?php

namespace App\Domains\Kitchen;

use App\Models\Branch;
use App\Models\KitchenTicket;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

final class KitchenRealtime
{
    public static function authorize(User $user, string $tenant, string $branch): bool
    {
        return (string) $user->tenant_id === $tenant && $user->hasPermission('kitchen.view')
            && Branch::whereKey($branch)->where('is_active', true)->exists();
    }

    public static function changed(KitchenTicket $ticket): void
    {
        if (config('broadcasting.default') !== 'reverb') {
            return;
        }
        $tenant = (int) $ticket->tenant_id;
        $branch = (int) $ticket->branch_id;
        DB::afterCommit(function () use ($tenant, $branch) {
            try {
                event(new KitchenChanged($tenant, $branch));
            } catch (\Throwable) {
                // A transport outage must not turn a committed command into a failed payment/order.
                Log::warning('Kitchen realtime unavailable; periodic API refresh remains active.');
            }
        });
    }
}
