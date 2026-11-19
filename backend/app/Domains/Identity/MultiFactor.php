<?php

namespace App\Domains\Identity;

use App\Domains\Tenancy\TenantContext;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class MultiFactor
{
    public function __construct(private Totp $totp) {}

    public function state(User $user): array
    {
        return ['enabled' => $user->mfa_enabled_at !== null, 'recovery_remaining' => count($user->mfa_recovery_hashes ?? []),
            'revision' => $user->security_revision];
    }

    private function actor(User $actor): User
    {
        $tenant = Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
        $user = User::where('tenant_id', $actor->tenant_id)->lockForUpdate()->findOrFail($actor->id);
        abort_unless($user->is_active && $tenant->status === 'active', 403, 'Tu cuenta no está activa.');

        return $user;
    }

    private function password(User $user, array $data): void
    {
        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'La contraseña no es correcta.']);
        }
        abort_unless($user->security_revision === (int) $data['revision'], 409, 'La seguridad de tu cuenta cambió. Actualiza antes de continuar.');
    }

    public function begin(Request $request, array $data): array
    {
        return DB::transaction(function () use ($request, $data) {
            $user = $this->actor($request->user());
            $this->password($user, $data);
            abort_if($user->mfa_enabled_at !== null, 409, 'MFA ya está activo.');
            $secret = $this->totp->secret();
            $user->forceFill(['mfa_pending_secret' => $secret, 'mfa_pending_id' => (string) Str::uuid(),
                'mfa_pending_expires_at' => now()->addMinutes(10), 'security_revision' => $user->security_revision + 1])->save();
            Audit::record('auth.mfa_setup', 'Se inició la configuración de MFA.', $user);

            return [...$this->totp->provisioning($user->email, $secret), 'pending_id' => $user->mfa_pending_id,
                'revision' => $user->security_revision, 'expires_at' => $user->mfa_pending_expires_at];
        });
    }

    private function codes(User $user): array
    {
        $codes = [];
        for ($i = 0; $i < 8; $i++) {
            $codes[] = implode('-', str_split(strtoupper(bin2hex(random_bytes(16))), 8));
        }
        $user->mfa_recovery_hashes = array_map(fn ($code) => hash('sha256', str_replace('-', '', $code)), $codes);

        return $codes;
    }

    private function changed(Request $request, User $user): void
    {
        $user->security_revision++;
        $user->mfa_version++;
        $user->save();
        DB::table('sessions')->where('user_id', $user->id)->where('id', '!=', $request->session()->getId())->delete();
        DB::table('screen_locks')->where('user_id', $user->id)->where('session_hash', '!=', app(ScreenSecurity::class)->key($request))->delete();
        // Set only after a committed credential change, including when tests wrap a transaction.
    }

    public function enable(Request $request, array $data): array
    {
        $result = DB::transaction(function () use ($request, $data) {
            $user = $this->actor($request->user());
            $this->password($user, $data);
            abort_if($user->mfa_enabled_at !== null || ! $user->mfa_pending_secret || $user->mfa_pending_id !== $data['pending_id']
                || ! $user->mfa_pending_expires_at || $user->mfa_pending_expires_at->isPast(), 409, 'La configuración venció o cambió. Iníciala de nuevo.');
            $step = $this->totp->verify($user->mfa_pending_secret, $data['credential'], null);
            if ($step === false) {
                throw ValidationException::withMessages(['credential' => 'El código de la aplicación no es válido.']);
            }
            $user->forceFill(['mfa_secret' => $user->mfa_pending_secret, 'mfa_enabled_at' => now(), 'mfa_last_step' => $step,
                'mfa_pending_secret' => null, 'mfa_pending_id' => null, 'mfa_pending_expires_at' => null]);
            $codes = $this->codes($user);
            $this->changed($request, $user);
            Audit::record('auth.mfa_enabled', 'Se activó MFA y se cerraron las otras sesiones.', $user);

            return ['recovery_codes' => $codes, 'version' => $user->mfa_version, ...$this->state($user)];
        });
        $request->session()->put('mfa_version', $result['version']);
        unset($result['version']);

        return $result;
    }

    private function consume(User $user, string $method, #[\SensitiveParameter] string $credential): bool
    {
        if ($method === 'totp') {
            $step = $this->totp->verify($user->mfa_secret, $credential, $user->mfa_last_step);
            if ($step === false) {
                return false;
            }
            $user->mfa_last_step = $step;

            return true;
        }
        $normalized = strtoupper(str_replace('-', '', $credential));
        if (! preg_match('/^[A-F0-9]{32}$/D', $normalized)) {
            return false;
        }
        $hashes = $user->mfa_recovery_hashes ?? [];
        $found = array_search(hash('sha256', $normalized), $hashes, true);
        if ($found === false) {
            return false;
        }
        unset($hashes[$found]);
        $user->mfa_recovery_hashes = array_values($hashes);

        return true;
    }

    public function manage(Request $request, array $data, bool $disable): array
    {
        $result = DB::transaction(function () use ($request, $data, $disable) {
            $user = $this->actor($request->user());
            $this->password($user, $data);
            abort_unless($user->mfa_enabled_at !== null, 409, 'MFA no está activo.');
            if (! $this->consume($user, $data['method'], $data['credential'])) {
                throw ValidationException::withMessages(['credential' => 'El código no es válido o ya se utilizó.']);
            }
            $codes = $disable ? [] : $this->codes($user);
            if ($disable) {
                $user->forceFill(['mfa_secret' => null, 'mfa_enabled_at' => null, 'mfa_recovery_hashes' => null, 'mfa_last_step' => null]);
            }
            $this->changed($request, $user);
            Audit::record($disable ? 'auth.mfa_disabled' : 'auth.mfa_recovery_rotated', 'Se actualizó MFA y se cerraron las otras sesiones.', $user);

            return ['recovery_codes' => $codes, 'version' => $user->mfa_version, ...$this->state($user)];
        });
        $request->session()->put('mfa_version', $result['version']);
        unset($result['version']);

        return $result;
    }

    public function passwordStamp(User $user): string
    {
        return hash_hmac('sha256', $user->password, config('app.key'));
    }

    public function challenge(array $pending, array $data): ?User
    {
        abort_unless(($pending['expires_at'] ?? 0) > now()->timestamp, 401, 'El desafío venció. Inicia sesión de nuevo.');
        $actor = User::find($pending['user_id'] ?? 0);
        abort_unless($actor, 401);

        return app(TenantContext::class)->run($actor->tenant_id, fn () => DB::transaction(function () use ($actor, $pending, $data) {
            $user = $this->actor($actor);
            abort_unless($user->mfa_enabled_at !== null && $user->mfa_version === ($pending['version'] ?? null)
                && hash_equals($this->passwordStamp($user), $pending['password_stamp'] ?? ''), 401, 'El desafío ya no es válido. Inicia sesión de nuevo.');
            if (! $this->consume($user, $data['method'], $data['credential'])) {
                Audit::record('auth.mfa_failed', 'Se rechazó el segundo factor.', $user);

                return null;
            }
            $user->save();
            Audit::record('auth.login', 'Inicio de sesión con MFA.', $user);

            return $user;
        }));
    }
}
