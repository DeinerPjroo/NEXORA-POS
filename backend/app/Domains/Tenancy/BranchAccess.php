<?php

namespace App\Domains\Tenancy;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

final class BranchAccess
{
    private ?array $ids = null;

    private const DIRECT = ['courier_collections', 'courier_settlements', 'courier_cash_accounts', 'courier_cash_transfers', 'courier_availabilities', 'delivery_policies', 'delivery_zones', 'customers', 'customer_addresses', 'order_deliveries', 'cash_registers', 'cash_sessions', 'orders', 'sales', 'payments', 'sale_refunds', 'payment_reviews', 'dining_rooms', 'dining_tables', 'dining_sessions', 'dining_session_tables', 'dining_reservations', 'dining_reservation_tables', 'kitchen_stations', 'kitchen_routes', 'kitchen_dispatches', 'kitchen_tickets'];

    private const PARENTS = ['order_item_changes' => ['order_id', 'orders'], 'delivery_events' => ['order_id', 'orders'], 'preparation_corrections' => ['order_id', 'orders'], 'cash_movements' => ['cash_session_id', 'cash_sessions'], 'order_items' => ['order_id', 'orders'], 'order_events' => ['order_id', 'orders'], 'order_combos' => ['order_id', 'orders'], 'sale_accounts' => ['sale_id', 'sales'], 'dining_events' => ['dining_session_id', 'dining_sessions'], 'kitchen_ticket_lines' => ['order_id', 'orders'], 'kitchen_ticket_events' => ['order_id', 'orders']];

    public function run(User $user, callable $callback): mixed
    {
        $previous = $this->ids;
        $this->ids = $user->all_branches ? null : DB::table('employee_branches')->where('tenant_id', $user->tenant_id)->where('user_id', $user->id)->pluck('branch_id')->map(fn ($id) => (int) $id)->all();
        try {
            return $callback();
        } finally {
            $this->ids = $previous;
        }
    }

    public function apply(Builder $query): void
    {
        if ($this->ids === null) {
            return;
        }
        $model = $query->getModel();
        $table = $model->getTable();
        if ($table === 'branches' || in_array($table, self::DIRECT, true)) {
            $query->whereIn($model->qualifyColumn($table === 'branches' ? 'id' : 'branch_id'), $this->ids);
        } elseif (isset(self::PARENTS[$table])) {
            [$key, $parent] = self::PARENTS[$table];
            $query->whereIn($model->qualifyColumn($key), DB::table($parent)->where('tenant_id', app(TenantContext::class)->id())->whereIn('branch_id', $this->ids)->select('id'));
        }
    }

    public function assertWrite(Model $model): void
    {
        if ($this->ids === null) {
            return;
        }
        $table = $model->getTable();
        if ($table === 'branches' || in_array($table, self::DIRECT, true)) {
            abort_unless(in_array((int) ($table === 'branches' ? $model->id : $model->branch_id), $this->ids, true), 403, 'Sucursal no autorizada.');
        } elseif (isset(self::PARENTS[$table])) {
            [$key, $parent] = self::PARENTS[$table];
            abort_unless(DB::table($parent)->where('tenant_id', app(TenantContext::class)->id())->whereIn('branch_id', $this->ids)->where('id', $model->$key)->exists(), 403, 'Sucursal no autorizada.');
        }
    }
}
