<?php

namespace App\Http\Controllers;

use App\Domains\Identity\Audit;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterCompanyRequest;
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

    public function login(LoginRequest $request)
    {
        // Identidad global intencional: no hay empresa confiable antes de autenticar.
        $user = User::where('email', $request->validated('email'))->first();
        if (! $user || ! Hash::check($request->validated('password'), $user->password) || ! $user->is_active || $user->tenant->status !== 'active') {
            if ($user) {
                app(TenantContext::class)->run($user->tenant_id, fn () => Audit::record('auth.failed', 'Intento de acceso rechazado.', null));
            }
            throw ValidationException::withMessages(['email' => 'El correo o la contraseña no son correctos.']);
        }
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        app(TenantContext::class)->run($user->tenant_id, fn () => Audit::record('auth.login', 'Inicio de sesión.', $user));

        return response()->json(['message' => 'Sesión iniciada.']);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('role.permissions', 'tenant');

        return response()->json([
            'user' => $user->only('id', 'name', 'email'), 'company' => $user->tenant,
            'role' => $user->role->only('id', 'name', 'is_owner'),
            'permissions' => $user->role->permissions->pluck('key'), 'settings' => WorkspaceSetting::firstOrFail(),
        ]);
    }

    public function logout(Request $request)
    {
        Audit::record('auth.logout', 'Se cerró la sesión.', $request->user());
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
                $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
                DB::table('sessions')->where('user_id', $user->id)->delete();
                app(TenantContext::class)->run($user->tenant_id, fn () => Audit::record('auth.password_reset', 'Se restableció la contraseña y se revocaron las sesiones.', $user));
            });
        });
        if ($status !== Password::PasswordReset) {
            throw ValidationException::withMessages(['email' => 'El enlace no es válido o ha vencido. Solicita uno nuevo.']);
        }

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
        $data = $request->validate(['password' => ['required', 'string']]);
        abort_unless(Hash::check($data['password'], $request->user()->password), 422, 'La contraseña no es correcta.');
        DB::transaction(function () use ($request) {
            DB::table('sessions')->where('user_id', $request->user()->id)->where('id', '!=', $request->session()->getId())->delete();
            Audit::record('auth.sessions_revoked', 'Se cerraron las otras sesiones.', $request->user());
        });

        return response()->noContent();
    }
}
