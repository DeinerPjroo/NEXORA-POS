<?php

namespace App\Http\Middleware;

use App\Domains\Identity\ScreenSecurity;
use Closure;
use Illuminate\Http\Request;

final class EnsureScreenUnlocked
{
    public function handle(Request $request, Closure $next): mixed
    {
        $allowed = ['api/v1/auth/me', 'api/v1/auth/logout', 'api/v1/auth/security', 'api/v1/auth/screen/lock', 'api/v1/auth/screen/unlock'];
        if (! in_array($request->path(), $allowed, true) || ($request->path() === 'api/v1/auth/security' && ! $request->isMethod('GET'))) {
            if (app(ScreenSecurity::class)->locks($request)->exists()) {
                return response()->json(['message' => 'Tu pantalla está bloqueada. Desbloquéala para continuar.', 'code' => 'screen_locked'], 423);
            }
        }

        return $next($request);
    }
}
