<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Domains\Sales\CashLedger;
use App\Models\Branch;
use App\Models\CourierCashAccount;
use App\Models\CourierCashTransfer;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class TransferCourierCash
{
    public static function authorize(): void
    {
        foreach (['orders.view', 'orders.manage', 'cash.view', 'cash.movements'] as $permission) {
            Gate::authorize($permission);
        }
    }

    public function execute(User $actor, int $courierId, array $data): CourierCashTransfer
    {
        self::authorize();

        return app(IdempotentOperation::class)->run($actor, 'courier.cash.'.$courierId, $data, CourierCashTransfer::class, function ($data) use ($actor, $courierId) {
            $branch = Branch::whereKey($data['branch_id'])->firstOrFail();
            abort_unless(in_array($data['confirmed_handover'] ?? false, [true, 1, '1', 'yes', 'on', 'true'], true), 422, 'Confirma la entrega física del efectivo.');
            $courier = User::where('tenant_id', $actor->tenant_id)->whereKey($courierId)->firstOrFail();
            $advance = $data['kind'] === 'advance';
            if ($advance) {
                abort_unless($branch->is_active && $courier->is_active && $courier->hasPermission('deliveries.operate') && $courier->canAccessBranch($branch->id), 409, 'El repartidor no está autorizado para recibir fondos en esta sucursal.');
            }
            $currency = Tenant::whereKey($actor->tenant_id)->firstOrFail()->currency;
            $account = CourierCashAccount::where('branch_id', $branch->id)->where('courier_id', $courier->id)->where('currency', $currency)->lockForUpdate()->first();
            abort_unless(($account?->revision ?? 0) === (int) $data['account_revision'] && bccomp($account?->balance ?? '0', $data['expected_balance'], 4) === 0, 409, 'El saldo de custodia cambió. Actualiza antes de continuar.');
            $amount = Money::normalize($data['amount']);
            abort_unless(bccomp($amount, '0', 4) > 0, 422, 'El importe debe ser mayor que cero.');
            abort_if(! $advance && bccomp($amount, $account?->balance ?? '0', 4) > 0, 422, 'La devolución supera el fondo en custodia.');
            $balance = Money::bounded($advance ? bcadd($account?->balance ?? '0', $amount, 4) : bcsub($account?->balance ?? '0', $amount, 4));
            $movement = app(CashLedger::class)->record($actor, $data, $branch->id, $currency, $amount, $advance ? 'expense' : 'income', mb_substr(($advance ? 'Fondo de cambio a repartidor #' : 'Devolución de fondo de repartidor #').$courier->id.': '.$data['reason'], 0, 300));
            $account ??= new CourierCashAccount(['branch_id' => $branch->id, 'courier_id' => $courier->id, 'currency' => $currency, 'revision' => 0]);
            $account->balance = $balance;
            $account->revision++;
            $account->save();
            $transfer = CourierCashTransfer::create(['branch_id' => $branch->id, 'courier_cash_account_id' => $account->id, 'cash_session_id' => $data['cash_session_id'], 'cash_movement_id' => $movement->id, 'actor_id' => $actor->id, 'kind' => $data['kind'], 'amount' => $amount, 'balance_after' => $balance, 'account_revision' => $account->revision, 'confirmed_handover' => true, 'reason' => $data['reason'], 'created_at' => now()]);
            Audit::record('courier.cash.transferred', 'Se confirmó un traslado físico de fondo de cambio.', $actor, ['transfer_id' => $transfer->id, 'account_id' => $account->id, 'courier_id' => $courier->id, 'kind' => $data['kind'], 'amount' => $amount, 'balance_after' => $balance, 'cash_movement_id' => $movement->id]);

            return $transfer;
        });
    }
}
