<?php

namespace App\Domains\Orders;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class PreviewOrder
{
    public function execute(User $actor, array $data): array
    {
        Gate::authorize('orders.manage');
        Gate::authorize('catalog.view');

        return DB::transaction(function () use ($actor, $data) {
            Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
            $plan = app(OrderPlan::class)->build($actor, $data, false);

            return ['branch_id' => $plan['branch']->id, 'branch_name' => $plan['branch']->name, 'channel' => $data['channel'], 'currency' => $data['currency'], 'subtotal' => $plan['subtotal'], 'items' => $plan['preview_items']];
        });
    }
}
