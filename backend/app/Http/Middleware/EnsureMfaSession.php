<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

final class EnsureMfaSession
{
    public function handle(Request $request, Closure $next): mixed
    {
        $user = $request->user();
        if (($user->mfa_version > 1 || $user->mfa_enabled_at !== null) && $request->session()->get('mfa_version') !== $user->mfa_version) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json(['message' => 'La seguridad de tu cuenta cambió. Inicia sesión de nuevo.'], 401);
        }

        return $next($request);
    }
}
