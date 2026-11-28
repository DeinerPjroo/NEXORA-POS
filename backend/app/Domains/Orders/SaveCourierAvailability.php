<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Branch;
use App\Models\CourierAvailability;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class SaveCourierAvailability
{
    public function execute(User $actor, int $courierId, array $data): CourierAvailability
    {
        Gate::authorize('orders.view');
        Gate::authorize('orders.manage');

        return app(IdempotentOperation::class)->run($actor, 'courier.availability.'.$courierId, $data, CourierAvailability::class, function ($data) use ($actor, $courierId) {
            $branch = Branch::whereKey($data['branch_id'])->where('is_active', true)->firstOrFail();
            $courier = User::where('tenant_id', $actor->tenant_id)->whereKey($courierId)->firstOrFail();
            abort_unless($courier->is_active && $courier->hasPermission('deliveries.operate') && $courier->canAccessBranch($branch->id), 422, 'El empleado no está autorizado para repartir en esta sucursal.');
            $availability = CourierAvailability::where('branch_id', $branch->id)->where('user_id', $courier->id)->lockForUpdate()->first();
            abort_unless(($availability?->revision ?? 0) === (int) $data['revision'], 409, 'La disponibilidad cambió. Actualiza antes de continuar.');
            $availability ??= new CourierAvailability(['branch_id' => $branch->id, 'user_id' => $courier->id, 'revision' => 0]);
            $availability->available = $data['available'];
            $availability->revision++;
            $availability->save();
            Audit::record('courier.availability', 'Se registró disponibilidad de un repartidor.', $actor, ['courier_id' => $courier->id, 'branch_id' => $branch->id, 'available' => $availability->available, 'revision' => $availability->revision, 'reason' => $data['reason']]);

            return $availability;
        });
    }
}
