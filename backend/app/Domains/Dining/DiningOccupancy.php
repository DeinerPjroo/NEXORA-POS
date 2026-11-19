<?php

namespace App\Domains\Dining;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Sales\SaleBalance;
use App\Models\Branch;
use App\Models\DiningEvent;
use App\Models\DiningRoom;
use App\Models\DiningSession;
use App\Models\DiningSessionTable;
use App\Models\DiningTable;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class DiningOccupancy
{
    public function save(User $actor, array $data, ?DiningSession $session = null, ?int $reservationId = null): DiningSession
    {
        Gate::authorize('dining.operate');

        return app(IdempotentOperation::class)->run($actor, $session ? 'dining.session.update.'.$session->id : 'dining.session.open', $data, DiningSession::class, function ($data) use ($actor, $session, $reservationId) {
            $existing = $session !== null;
            if ($existing) {
                $session = $this->lock($session->id, (int) $data['revision']);
            } else {
                $branch = Branch::whereKey($data['branch_id'])->lockForUpdate()->firstOrFail();
                abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
                $session = new DiningSession(['branch_id' => $branch->id, 'opened_by' => $actor->id, 'opened_at' => now(), 'status' => 'open', 'revision' => 0]);
            }
            $tables = DiningTable::whereIn('id', array_column($data['tables'], 'id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            abort_unless($tables->count() === count($data['tables']), 422, 'Alguna mesa no pertenece a tu empresa.');
            foreach ($data['tables'] as $expected) {
                $table = $tables->get((int) $expected['id']);
                abort_unless($table->revision === (int) $expected['revision'], 409, 'Una mesa cambió. Revisa su configuración.');
                abort_unless($table->branch_id === $session->branch_id && $table->is_active && DiningRoom::whereKey($table->dining_room_id)->where('is_active', true)->exists(), 409, 'Las mesas deben estar activas en la misma sucursal.');
            }
            abort_if($data['guest_count'] > $tables->sum('capacity'), 422, 'La cantidad de personas supera la capacidad de las mesas seleccionadas.');
            $held = $existing ? $session->memberships()->whereNull('released_at')->pluck('dining_table_id')->all() : [];
            ReservationWindows::assertAvailableNow(array_values(array_diff($tables->keys()->all(), $held)), $reservationId);
            $occupied = DiningSessionTable::whereIn('dining_table_id', $tables->keys())->whereNull('released_at')->when($existing, fn ($q) => $q->where('dining_session_id', '!=', $session->id))->exists();
            abort_if($occupied, 409, 'Otra atención ya ocupa alguna de estas mesas.');
            $waiter = null;
            if ($data['waiter_id'] ?? null) {
                $waiter = User::where('tenant_id', $actor->tenant_id)->whereKey($data['waiter_id'])->with('role.permissions')->firstOrFail();
                abort_unless($waiter->hasPermission('dining.operate'), 422, 'El mesero debe ser un usuario activo autorizado para operar mesas.');
            }
            $session->guest_count = (int) $data['guest_count'];
            $session->notes = $data['notes'] ?? null;
            $session->waiter_id = $waiter?->id;
            $session->revision++;
            $session->save();
            $current = $session->memberships()->whereNull('released_at')->lockForUpdate()->get();
            foreach ($current as $member) {
                if (! $tables->has($member->dining_table_id)) {
                    $member->released_at = now();
                    $member->save();
                }
            }
            foreach ($tables as $table) {
                if (! $current->contains('dining_table_id', $table->id)) {
                    $session->memberships()->create(['branch_id' => $session->branch_id, 'dining_table_id' => $table->id, 'table_name' => $table->name, 'joined_at' => now()]);
                }
            }
            $this->event($actor, $session, $existing ? 'updated' : 'opened', ['table_ids' => $tables->keys()->all(), 'table_names' => $tables->pluck('name')->all(), 'waiter_id' => $waiter?->id, 'waiter_name' => $waiter?->name, 'guest_count' => $session->guest_count]);

            return $session;
        });
    }

    public function close(User $actor, DiningSession $session, array $data): DiningSession
    {
        Gate::authorize('dining.operate');

        return app(IdempotentOperation::class)->run($actor, 'dining.session.close.'.$session->id, $data, DiningSession::class, function ($data) use ($actor, $session) {
            $session = $this->lock($session->id, (int) $data['revision']);
            foreach ($session->orders()->with('sale.payments', 'sale.refunds')->orderBy('id')->lockForUpdate()->get() as $order) {
                if ($order->status === 'cancelled') {
                    continue;
                }
                abort_unless($order->sale, 409, 'Quedan pedidos sin cobrar o cancelar.');
                abort_if(bccomp(app(SaleBalance::class)->amounts($order->sale)['balance_due'], '0', 4) > 0, 409, 'Quedan pedidos con saldo pendiente.');
            }
            foreach ($session->memberships()->whereNull('released_at')->lockForUpdate()->get() as $member) {
                $member->released_at = now();
                $member->save();
            }
            $session->status = 'closed';
            $session->closed_by = $actor->id;
            $session->closed_at = now();
            $session->revision++;
            $session->save();
            $this->event($actor, $session, 'closed', []);

            return $session;
        });
    }

    public function forOrder(User $actor, array $data): ?DiningSession
    {
        if (! ($data['dining_session_id'] ?? null)) {
            return null;
        }
        Gate::authorize('dining.operate');
        abort_unless($data['channel'] === 'dine_in', 422, 'Una atención de mesa requiere pedido en restaurante.');
        $session = $this->lock((int) $data['dining_session_id'], (int) $data['dining_session_revision']);
        abort_if($session->orders()->count() >= 100, 422, 'Una atención admite hasta 100 pedidos.');
        abort_unless($session->branch_id === (int) $data['branch_id'], 409, 'La atención pertenece a otra sucursal.');

        return $session;
    }

    public function snapshot(DiningSession $session): array
    {
        return ['version' => 1, 'session_id' => $session->id, 'session_revision' => $session->revision, 'tables' => $session->memberships()->whereNull('released_at')->orderBy('id')->get()->map(fn ($m) => ['id' => $m->dining_table_id, 'name' => $m->table_name])->all(), 'waiter_id' => $session->waiter_id];
    }

    public function recordOrder(User $actor, DiningSession $session, Order $order): void
    {
        $session->revision++;
        $session->save();
        $this->event($actor, $session, 'order.added', ['order_id' => $order->id]);
    }

    public function transfer(User $actor, Order $order, array $data): Order
    {
        Gate::authorize('dining.operate');
        Gate::authorize('orders.manage');
        Gate::authorize('orders.view');

        return app(IdempotentOperation::class)->run($actor, 'dining.order.transfer.'.$order->id, $data, Order::class, function ($data) use ($actor, $order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            abort_unless($order->revision === (int) $data['order_revision'] && $order->dining_session_id && $order->channel === 'dine_in', 409, 'El pedido cambió o no está asociado a una atención.');
            abort_if($order->sale()->exists() || $order->status === 'cancelled', 409, 'Solo se trasladan pedidos sin venta y sin cancelar.');
            abort_if((int) $data['target_session_id'] === (int) $order->dining_session_id, 422, 'Selecciona otra atención.');
            $source = $this->lock((int) $order->dining_session_id, (int) $data['source_revision']);
            $target = $this->lock((int) $data['target_session_id'], (int) $data['target_revision']);
            abort_if($target->orders()->count() >= 100, 422, 'La atención de destino alcanzó 100 pedidos.');
            abort_unless($source->branch_id === $target->branch_id, 409, 'El traslado requiere la misma sucursal.');
            $order->dining_session_id = $target->id;
            $order->revision++;
            $order->save();
            foreach ([$source, $target] as $session) {
                $session->revision++;
                $session->save();
                $this->event($actor, $session, 'order.transferred', ['order_id' => $order->id, 'source_id' => $source->id, 'target_id' => $target->id]);
            }

            return $order;
        });
    }

    private function lock(int $id, int $revision): DiningSession
    {
        $session = DiningSession::whereKey($id)->lockForUpdate()->firstOrFail();
        abort_unless($session->status === 'open' && $session->revision === $revision, 409, 'La atención cambió o ya está cerrada. Actualiza sus datos.');

        return $session;
    }

    private function event(User $actor, DiningSession $session, string $action, array $details): void
    {
        DiningEvent::create(['dining_session_id' => $session->id, 'actor_id' => $actor->id, 'action' => $action, 'details' => $details, 'created_at' => now()]);
        Audit::record('dining.session.'.$action, 'Se registró una operación de mesas.', $actor, ['session_id' => $session->id, 'revision' => $session->revision, ...$details]);
    }
}
