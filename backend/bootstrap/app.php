<?php

use App\Http\Middleware\AuditDeniedAccess;
use App\Http\Middleware\EnsureMfaSession;
use App\Http\Middleware\EnsureScreenUnlocked;
use App\Http\Middleware\ResolveTenant;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Routing\Middleware\ThrottleRequests;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : config('nexora.frontend_url').'/ingresar');
        $middleware->alias(['tenant' => ResolveTenant::class, 'screen.unlocked' => EnsureScreenUnlocked::class, 'mfa.session' => EnsureMfaSession::class, 'audit.denials' => AuditDeniedAccess::class]);
        // Resolver el contexto ANTES de enlazar {branch} o {role} con Eloquent.
        $middleware->prependToPriorityList(SubstituteBindings::class, ResolveTenant::class);
        $middleware->prependToPriorityList(SubstituteBindings::class, EnsureScreenUnlocked::class);
        $middleware->prependToPriorityList(ResolveTenant::class, EnsureMfaSession::class);
        $middleware->prependToPriorityList(ThrottleRequests::class, AuditDeniedAccess::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
    })->create();
