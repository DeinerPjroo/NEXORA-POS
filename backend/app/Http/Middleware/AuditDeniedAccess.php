<?php

namespace App\Http\Middleware;

use App\Domains\Identity\Audit;
use App\Domains\Tenancy\TenantContext;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

final class AuditDeniedAccess
{
    public function handle(Request $request, Closure $next): mixed
    {
        // Capture trusted identity before a stale session is invalidated downstream.
        $request->attributes->set('_nexora_audit_actor', $request->user()?->getAuthIdentifier());

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        $events = [
            401 => ['access.unauthorized', 'Se rechazó una sesión cuyo acceso ya no es válido.'],
            403 => ['access.denied', 'Se rechazó una acción por permisos o estado de la cuenta.'],
            404 => ['access.unavailable', 'Se solicitó un recurso no disponible para esta cuenta.'],
            423 => ['access.locked', 'Se rechazó una operación con la pantalla bloqueada.'],
            429 => ['access.limited', 'Se limitó una operación por exceso de intentos.'],
        ];
        $status = $response->getStatusCode();
        $actorId = $request->attributes->get('_nexora_audit_actor');
        $route = $request->route()?->uri();
        if (! isset($events[$status]) || ! is_numeric($actorId) || ! is_string($route) || ! str_starts_with($route, 'api/v1/')) {
            return;
        }
        try {
            $sample = 'access-sample:'.$actorId.':'.hash('sha256', $status.'|'.$request->method().'|'.$route);
            if (RateLimiter::tooManyAttempts($sample, 1)
                || ! RateLimiter::attempt('access-budget:'.$actorId, 20, fn () => true, 60)
                || ! RateLimiter::attempt($sample, 1, fn () => true, 60)) {
                return;
            }
            // Actor id comes from authentication; never accept a requested tenant or binding.
            $actor = User::find((int) $actorId);
            if (! $actor) {
                return;
            }
            app(TenantContext::class)->run($actor->tenant_id, fn () => Audit::record($events[$status][0], $events[$status][1], $actor,
                ['status' => $status, 'method' => $request->method(), 'route' => $route]));
        } catch (\Throwable $failure) {
            // Denial remains a denial if the audit sink is unavailable. Never log exception data.
            try {
                Log::warning('Denied-access audit unavailable.', ['exception' => get_class($failure)]);
            } catch (\Throwable) {
            }
        }
    }
}
