<?php

namespace App\Domains\Sales;

use App\Domains\Operations\Money;
use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashSession;
use App\Models\User;
use Illuminate\Validation\ValidationException;

final class CashLedger
{
    public function record(User $actor, array $data, int $branch, string $currency, string $amount, string $type, string $reason): CashMovement
    {
        $session = $this->verifySession($data, $branch, $currency);
        if ($type === 'expense' && bccomp($amount, $session->expected_amount, 4) > 0) {
            throw ValidationException::withMessages(['cash_session_id' => 'La caja no tiene efectivo esperado suficiente para la devolución.']);
        }
        $session->expected_amount = Money::bounded($type === 'income' ? bcadd($session->expected_amount, $amount, 4) : bcsub($session->expected_amount, $amount, 4));
        $session->revision++;
        $session->save();

        return CashMovement::create(['cash_session_id' => $session->id, 'actor_id' => $actor->id, 'type' => $type, 'amount' => $amount, 'reason' => $reason, 'created_at' => now()]);
    }

    public function registerNonCash(array $data, int $branch, string $currency): CashSession
    {
        $session = $this->verifySession($data, $branch, $currency);
        $session->revision++;
        $session->save();

        return $session;
    }

    private function verifySession(array $data, int $branch, string $currency): CashSession
    {
        $session = CashSession::findOrFail($data['cash_session_id']);
        $register = CashRegister::whereKey($session->cash_register_id)->lockForUpdate()->firstOrFail();
        $session = CashSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
        abort_unless($session->branch_id === $branch && $session->currency === $currency, 409, 'La caja debe pertenecer a la sucursal y moneda de la venta.');
        abort_unless($register->is_active && $session->status === 'open' && (int) $register->active_session_id === $session->id, 409, 'Selecciona una caja con sesión abierta.');
        abort_unless($session->revision === (int) $data['cash_revision'], 409, 'La caja cambió. Actualiza sus datos antes de continuar.');

        return $session;
    }
}
