<?php

namespace App\Http\Middleware;

use App\Domains\Tenancy\BranchAccess;
use App\Domains\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;

final class ResolveTenant
{
    public function handle(Request $request, Closure $next): mixed
    {
        $user = $request->user();
        abort_unless($user && $user->is_active && $user->tenant->status === 'active', 403, 'Tu cuenta no está activa.');

        return app(TenantContext::class)->run($user->tenant_id, fn () => app(BranchAccess::class)->run($user, fn () => $next($request)));
    }
}
