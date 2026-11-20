<?php

namespace App\Providers;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Tenancy\BranchAccess;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Policies\BranchPolicy;
use App\Policies\CatalogPolicy;
use App\Policies\RolePolicy;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->scoped(TenantContext::class);
        $this->app->scoped(BranchAccess::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(Branch::class, BranchPolicy::class);
        Gate::policy(Role::class, RolePolicy::class);
        Gate::policy(Category::class, CatalogPolicy::class);
        Gate::policy(Product::class, CatalogPolicy::class);
        foreach (array_keys(PermissionCatalog::ALL) as $permission) {
            Gate::define($permission, fn (User $user) => $user->hasPermission($permission));
        }
        RateLimiter::for('login', function (Request $request) {
            return [
                Limit::perMinute(20)->by($request->ip()),
                Limit::perMinute(5)->by(strtolower((string) $request->input('email')).'|'.$request->ip()),
            ];
        });
        RateLimiter::for('registration', fn (Request $request) => Limit::perHour(10)->by($request->ip()));
        RateLimiter::for('uploads', fn (Request $request) => Limit::perMinute(20)->by($request->user()?->id ?? $request->ip()));
        RateLimiter::for('recovery', fn (Request $request) => Limit::perMinute(3)->by($request->ip()));
        RateLimiter::for('credentials', fn (Request $request) => Limit::perMinute(5)->by('credentials:'.$request->user()->id));
        RateLimiter::for('mfa-manage', fn (Request $request) => Limit::perMinute(5)->by('mfa-manage:'.$request->user()->id));
        RateLimiter::for('mfa-challenge', fn (Request $request) => [
            Limit::perMinute(5)->by('mfa-challenge:'.($request->session()->get('mfa_pending_login.user_id') ?? $request->ip())),
            Limit::perMinute(20)->by('mfa-ip:'.$request->ip()),
        ]);
        RateLimiter::for('verification', fn (Request $request) => Limit::perMinute(3)->by('verification:'.$request->user()->id));
        RateLimiter::for('verification-confirm', fn (Request $request) => Limit::perMinute(10)->by('verification-confirm:'.$request->user()->id));
        RateLimiter::for('unlock', fn (Request $request) => [
            Limit::perMinute(5)->by('unlock:'.$request->user()->id),
            Limit::perMinute(20)->by('unlock-ip:'.$request->ip()),
        ]);
        ResetPassword::createUrlUsing(fn ($user, $token) => config('nexora.frontend_url').'/restablecer?token='.$token.'&email='.urlencode($user->email));
        VerifyEmail::createUrlUsing(function ($user) {
            $signed = URL::temporarySignedRoute('verification.verify', now()->addMinutes(60),
                ['id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification())], absolute: false);

            return config('nexora.frontend_url').'/verificar-correo?verificacion='.rawurlencode($signed);
        });
        VerifyEmail::toMailUsing(fn ($user, $url) => (new MailMessage)
            ->subject('Verifica tu correo en Nexora POS')->greeting('Hola, '.$user->name.'.')
            ->line('Confirma el correo asociado a tu cuenta. Este enlace vence en 60 minutos.')
            ->action('Verificar mi correo', $url)->line('Si no solicitaste este enlace, puedes ignorar este mensaje.'));
    }
}
