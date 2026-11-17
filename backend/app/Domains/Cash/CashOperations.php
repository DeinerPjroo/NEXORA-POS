<?php

namespace App\Domains\Cash;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Models\Branch;
use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashSession;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class CashOperations
{
    public function __construct(private IdempotentOperation $operations) {}

    public function createRegister(User $actor, array $data): CashRegister
    {
        Gate::authorize('cash.manage');
        return $this->operations->run($actor, 'cash.register.create', $data, CashRegister::class, function ($data) use ($actor) {
            $branch = Branch::whereKey($data['branch_id'])->lockForUpdate()->firstOrFail();
            abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
            if (CashRegister::where('branch_id', $branch->id)->where('code', $data['code'])->exists()) throw ValidationException::withMessages(['code' => 'Esta sucursal ya tiene una caja con ese código.']);
            $register = CashRegister::create([...$data, 'is_active' => true]);
            Audit::record('cash.register.created', 'Se creó una caja en la sucursal.', $actor, ['cash_register_id' => $register->id]);
            return $register;
        });
    }

    public function open(User $actor, CashRegister $register, array $data): CashSession
    {
        Gate::authorize('cash.manage');
        return $this->operations->run($actor, 'cash.open.'.$register->id, $data, CashSession::class, function ($data) use ($actor, $register) {
            $register = CashRegister::whereKey($register->id)->lockForUpdate()->firstOrFail();
            $branch = Branch::whereKey($register->branch_id)->lockForUpdate()->firstOrFail();
            abort_unless($register->is_active && $branch->is_active, 409, 'La caja o sucursal está inactiva.');
            abort_if($register->active_session_id !== null, 409, 'Esta caja ya tiene una sesión abierta.');
            $currency = $actor->tenant()->value('currency');
            abort_if($currency !== $data['currency'], 409, 'La moneda cambió. Actualiza la página antes de abrir la caja.');
            $amount = Money::normalize($data['opening_amount']);
            $session = CashSession::create(['branch_id' => $branch->id, 'cash_register_id' => $register->id, 'opened_by' => $actor->id, 'currency' => $currency, 'status' => 'open', 'opening_amount' => $amount, 'expected_amount' => $amount, 'revision' => 1, 'opened_at' => now()]);
            $register->active_session_id = $session->id;
            $register->save();
            Audit::record('cash.opened', 'Se abrió una sesión de caja.', $actor, ['cash_session_id' => $session->id]);
            return $session;
        });
    }

    public function movement(User $actor, CashSession $session, array $data): CashMovement
    {
        Gate::authorize('cash.movements');
        return $this->operations->run($actor, 'cash.movement.'.$session->id, $data, CashMovement::class, function ($data) use ($actor, $session) {
            $session = $this->lockedOpenSession($session, $data['revision']);
            if (bccomp($data['amount'], '0', 4) <= 0) throw ValidationException::withMessages(['amount' => 'El movimiento debe ser mayor que cero.']);
            if ($data['type'] === 'expense' && bccomp($data['amount'], $session->expected_amount, 4) > 0) throw ValidationException::withMessages(['amount' => 'El egreso supera el efectivo esperado en esta caja.']);
            $balance = $data['type'] === 'income' ? bcadd($session->expected_amount, $data['amount'], 4) : bcsub($session->expected_amount, $data['amount'], 4);
            $session->expected_amount = Money::bounded($balance);
            $session->revision++;
            $session->save();
            $movement = CashMovement::create(['cash_session_id' => $session->id, 'actor_id' => $actor->id, 'type' => $data['type'], 'amount' => $data['amount'], 'reason' => $data['reason'], 'created_at' => now()]);
            Audit::record('cash.movement.created', 'Se registró un movimiento manual de caja.', $actor, ['cash_session_id' => $session->id, 'movement_id' => $movement->id]);
            return $movement;
        });
    }

    public function close(User $actor, CashSession $session, array $data): CashSession
    {
        Gate::authorize('cash.manage');
        return $this->operations->run($actor, 'cash.close.'.$session->id, $data, CashSession::class, function ($data) use ($actor, $session) {
            $session = $this->lockedOpenSession($session, $data['revision']);
            $session->counted_amount = Money::normalize($data['counted_amount']);
            $session->difference = bcsub($session->counted_amount, $session->expected_amount, 4);
            $session->closing_note = $data['closing_note'] ?? null;
            $session->closed_by = $actor->id;
            $session->closed_at = now();
            $session->status = 'closed';
            $session->revision++;
            $session->save();
            $register = CashRegister::findOrFail($session->cash_register_id);
            $register->active_session_id = null;
            $register->save();
            Audit::record('cash.closed', 'Se cerró la sesión de caja con arqueo.', $actor, ['cash_session_id' => $session->id, 'difference' => $session->difference]);
            return $session;
        });
    }

    private function lockedOpenSession(CashSession $session, int $revision): CashSession
    {
        $register = CashRegister::whereKey($session->cash_register_id)->lockForUpdate()->firstOrFail();
        $session = CashSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
        abort_unless($session->status === 'open' && (int) $register->active_session_id === $session->id, 409, 'Esta sesión de caja está cerrada.');
        abort_if($session->revision !== $revision, 409, 'La caja cambió en otra sesión. Actualiza los datos antes de continuar.');
        return $session;
    }
}
