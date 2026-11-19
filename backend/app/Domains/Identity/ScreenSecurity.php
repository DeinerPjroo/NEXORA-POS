<?php

namespace App\Domains\Identity;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class ScreenSecurity
{
    public function key(Request $request): string
    {
        return hash_hmac('sha256', $request->session()->getId(), config('app.key'));
    }

    public function locks(Request $request)
    {
        return DB::table('screen_locks')->where('session_hash', $this->key($request))
            ->where('tenant_id', $request->user()->tenant_id)->where('user_id', $request->user()->id);
    }

    public function state(Request $request): array
    {
        $user = User::where('tenant_id', $request->user()->tenant_id)->findOrFail($request->user()->id);
        $lock = $this->locks($request)->first();

        return ['locked' => $lock !== null, 'challenge' => $lock?->challenge,
            'pin_enabled' => $user->pin_hash !== null, 'revision' => $user->security_revision];
    }

    private function actor(Request $request): User
    {
        // Same order as business commands; serialize credential changes and screen commands.
        Tenant::whereKey($request->user()->tenant_id)->lockForUpdate()->firstOrFail();

        return User::where('tenant_id', $request->user()->tenant_id)->lockForUpdate()->findOrFail($request->user()->id);
    }

    public function configure(Request $request, array $data): void
    {
        DB::transaction(function () use ($request, $data) {
            $user = $this->actor($request);
            abort_if($this->locks($request)->exists(), 423, 'Tu pantalla está bloqueada.');
            if (! Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages(['current_password' => 'La contraseña no es correcta.']);
            }
            abort_unless($user->security_revision === (int) $data['revision'], 409, 'La configuración cambió. Actualiza antes de guardar.');
            $user->forceFill(['pin_hash' => $data['pin'] === null ? null : Hash::make($data['pin']),
                'security_revision' => $user->security_revision + 1])->save();
            Audit::record($data['pin'] === null ? 'auth.pin_removed' : 'auth.pin_configured', 'Se actualizó el PIN personal.', $user);
        });
    }

    public function lock(Request $request): void
    {
        DB::transaction(function () use ($request) {
            $user = $this->actor($request);
            if ($this->locks($request)->exists()) {
                return;
            }
            DB::table('screen_locks')->insert(['session_hash' => $this->key($request), 'tenant_id' => $user->tenant_id,
                'user_id' => $user->id, 'challenge' => (string) Str::uuid(), 'created_at' => now()]);
            Audit::record('auth.screen_locked', 'Se bloqueó la pantalla de esta sesión.', $user);
        });
    }

    public function unlock(Request $request, array $data): bool
    {
        return DB::transaction(function () use ($request, $data) {
            $user = $this->actor($request);
            $lock = $this->locks($request)->first();
            if (! $lock) {
                return true;
            }
            abort_unless(hash_equals($lock->challenge, $data['challenge']), 409, 'El bloqueo cambió. Actualiza e intenta de nuevo.');
            $hash = $data['method'] === 'pin' ? $user->pin_hash : $user->password;
            if (! $hash || ! Hash::check($data['credential'], $hash)) {
                Audit::record('auth.unlock_failed', 'Se rechazó un intento de desbloqueo.', $user);

                return false;
            }
            $this->locks($request)->delete();
            Audit::record('auth.screen_unlocked', 'Se desbloqueó la pantalla de esta sesión.', $user);

            return true;
        });
    }
}
