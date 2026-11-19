<?php

namespace App\Http\Controllers;

use App\Domains\Identity\Audit;
use App\Domains\Identity\MultiFactor;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Identity\ScreenSecurity;
use App\Domains\Tenancy\TenantContext;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterCompanyRequest;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkspaceSetting;
use App\Rules\PasswordByteLength;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

final class AuthController extends Controller
{
    public function register(RegisterCompanyRequest $request, RegisterCompany $service)
    {
        $user = $service->execute($request->validated());
        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json(['message' => 'Tu espacio de trabajo está listo.'], 201);
    }

    public function login(LoginRequest $request, MultiFactor $mfa)
    {
        // Identidad global intencional: no hay empresa confiable antes de autenticar.
        $user = User::where('email', $request->validated('email'))->first();
        if (! $user || ! Hash::check($request->validated('password'), $user->password) || ! $user->is_active || $user->tenant->status !== 'active') {
            if ($user) {
                app(TenantContext::class)->run($user->tenant_id, fn () => Audit::record('auth.failed', 'Intento de acceso rechazado.', null));
            }
            throw ValidationException::withMessages(['email' => 'El correo o la contraseña no son correctos.']);
        }
        if ($user->mfa_enabled_at !== null) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            $request->session()->put('mfa_pending_login', ['user_id' => $user->id, 'expires_at' => now()->addMinutes(5)->timestamp,
                'version' => $user->mfa_version, 'password_stamp' => $mfa->passwordStamp($user)]);
            app(TenantContext::class)->run($user->tenant_id, fn () => Audit::record('auth.mfa_challenged', 'Se solicitó el segundo factor.', $user));

            return response()->json(['mfa_required' => true, 'message' => 'Confirma tu segundo factor.'], 202);
        }
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put('mfa_version', $user->mfa_version);
        app(TenantContext::class)->run($user->tenant_id, fn () => Audit::record('auth.login', 'Inicio de sesión.', $user));

        return response()->json(['message' => 'Sesión iniciada.']);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('role.permissions', 'tenant');

        return response()->json([
            'user' => $user->only('id', 'name', 'email', 'email_verified_at'), 'company' => $user->tenant,
            'role' => $user->role->only('id', 'name', 'is_owner'),
            'permissions' => $user->role->permissions->pluck('key'), 'settings' => WorkspaceSetting::firstOrFail(),
            'security' => app(ScreenSecurity::class)->state($request),
        ]);
    }

    public function logout(Request $request)
    {
        Audit::record('auth.logout', 'Se cerró la sesión.', $request->user());
        app(ScreenSecurity::class)->locks($request)->delete();
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function forgot(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:190']]);
        Password::sendResetLink(['email' => strtolower($data['email'])]);

        return response()->json(['message' => 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.']);
    }

    public function reset(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'], 'token' => ['required', 'string'],
            'password' => ['required', 'string', 'max:72', 'confirmed', new PasswordByteLength, PasswordRule::min(12)->mixedCase()->numbers()],
        ]);
        $data['email'] = strtolower($data['email']);
        $status = Password::reset($data, function (User $user, string $password) {
            DB::transaction(function () use ($user, $password) {
                Tenant::whereKey($user->tenant_id)->lockForUpdate()->firstOrFail();
                $user = User::where('tenant_id', $user->tenant_id)->lockForUpdate()->findOrFail($user->id);
                $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60), 'pin_hash' => null,
                    'mfa_pending_secret' => null, 'mfa_pending_id' => null, 'mfa_pending_expires_at' => null,
                    'mfa_version' => $user->mfa_version + 1,
                    'security_revision' => $user->security_revision + 1])->save();
                DB::table('sessions')->where('user_id', $user->id)->delete();
                DB::table('screen_locks')->where('user_id', $user->id)->delete();
                app(TenantContext::class)->run($user->tenant_id, fn () => Audit::record('auth.password_reset', 'Se restableció la contraseña y se revocaron las sesiones.', $user));
            });
        });
        if ($status !== Password::PasswordReset) {
            throw ValidationException::withMessages(['email' => 'El enlace no es válido o ha vencido. Solicita uno nuevo.']);
        }
        // Do not recreate a previously authenticated current session after revocation.
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Contraseña actualizada. Inicia sesión de nuevo.']);
    }

    public function sessions(Request $request)
    {
        return DB::table('sessions')->where('user_id', $request->user()->id)
            ->where('last_activity', '>=', time() - (int) config('session.lifetime') * 60)
            ->orderByDesc('last_activity')->get(['id', 'ip_address', 'user_agent', 'last_activity'])
            ->map(fn ($session) => [
                'current' => $session->id === $request->session()->getId(), 'ip_address' => $session->ip_address,
                'user_agent' => $session->user_agent, 'last_activity' => $session->last_activity,
            ]);
    }

    public function revokeSessions(Request $request)
    {
        $data = $request->validate(['password' => ['required', 'string', 'max:72', new PasswordByteLength]]);
        $version = DB::transaction(function () use ($request, $data) {
            Tenant::whereKey($request->user()->tenant_id)->lockForUpdate()->firstOrFail();
            $user = User::where('tenant_id', $request->user()->tenant_id)->lockForUpdate()->findOrFail($request->user()->id);
            abort_unless(Hash::check($data['password'], $user->password), 422, 'La contraseña no es correcta.');
            $user->forceFill(['mfa_version' => $user->mfa_version + 1])->save();
            DB::table('sessions')->where('user_id', $request->user()->id)->where('id', '!=', $request->session()->getId())->delete();
            DB::table('screen_locks')->where('user_id', $request->user()->id)->where('session_hash', '!=', app(ScreenSecurity::class)->key($request))->delete();
            Audit::record('auth.sessions_revoked', 'Se cerraron las otras sesiones.', $user);

            return $user->mfa_version;
        });
        $request->session()->put('mfa_version', $version);

        return response()->noContent();
    }
}
