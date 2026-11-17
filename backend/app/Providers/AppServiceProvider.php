<?php

namespace App\Providers;

use App\Domains\Identity\PermissionCatalog;
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
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->scoped(TenantContext::class);
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
        ResetPassword::createUrlUsing(fn ($user, $token) => config('nexora.frontend_url').'/restablecer?token='.$token.'&email='.urlencode($user->email));
    }
}
