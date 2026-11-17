<?php

namespace App\Http\Controllers;

use App\Domains\Identity\Audit;
use App\Domains\Studio\PublishTheme;
use App\Http\Requests\CompanyRequest;
use App\Http\Requests\ThemeRequest;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Product;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\ThemeVersion;
use App\Models\User;
use App\Models\WorkspaceSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class WorkspaceController extends Controller
{
    public function overview(Request $request)
    {
        Gate::authorize('dashboard.view');

        return [
            'branches' => Branch::count(), 'active_branches' => Branch::where('is_active', true)->count(),
            // User es identidad global: limitar SIEMPRE las consultas administrativas por tenant.
            'team' => User::where('tenant_id', $request->user()->tenant_id)->count(),
            'roles' => Role::count(), 'theme_revision' => WorkspaceSetting::firstOrFail()->revision,
            'activity' => $request->user()->hasPermission('audit.view') ? AuditLog::latest('id')->limit(8)->get() : [],
        ];
    }

    public function team(Request $request)
    {
        Gate::authorize('team.view');

        return User::where('tenant_id', $request->user()->tenant_id)->with('role:id,tenant_id,name')->orderBy('id')
            ->get(['id', 'tenant_id', 'name', 'email', 'role_id', 'is_active', 'created_at']);
    }

    public function settings()
    {
        Gate::authorize('settings.view');

        return request()->user()->tenant;
    }

    public function updateCompany(CompanyRequest $request)
    {
        Gate::authorize('settings.manage');

        return DB::transaction(function () use ($request) {
            $company = Tenant::whereKey($request->user()->tenant_id)->lockForUpdate()->firstOrFail();
            if ($company->currency !== $request->validated('currency') && (Product::exists() || \App\Models\CashSession::exists() || \App\Models\Order::exists())) {
                throw ValidationException::withMessages(['currency' => 'La moneda no se puede cambiar cuando existen productos, sesiones de caja o pedidos.']);
            }
            $company->update($request->validated());
            Audit::record('company.updated', 'Se actualizó la información de la empresa.', $request->user());

            return $company;
        });
    }

    public function theme()
    {
        Gate::authorize('studio.view');

        return ['settings' => WorkspaceSetting::firstOrFail(), 'versions' => ThemeVersion::latest('version')->limit(20)->get(), 'defaults' => config('nexora.theme')];
    }

    public function publishTheme(ThemeRequest $request, PublishTheme $service)
    {
        Gate::authorize('studio.manage');

        return $service->execute($request->validated(), $request->user());
    }
}
