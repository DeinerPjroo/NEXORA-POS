<?php

namespace App\Domains\Identity;

use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\ThemeVersion;
use App\Models\User;
use App\Models\WorkspaceSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class RegisterCompany
{
    public function execute(array $data): User
    {
        return DB::transaction(function () use ($data) {
            $tenant = Tenant::create([
                'name' => $data['company_name'], 'public_id' => (string) Str::uuid(),
                'business_type' => $data['business_type'],
            ]);

            return app(TenantContext::class)->run($tenant->id, function () use ($tenant, $data) {
                $permissions = Permission::all();
                $roles = [];
                foreach (['Propietario', 'Administrador', 'Cajero', 'Mesero', 'Cocinero', 'Repartidor', 'Encargado de inventario'] as $name) {
                    $role = new Role(['name' => $name]);
                    $role->is_owner = $name === 'Propietario';
                    $role->save();
                    $keys = match ($name) {
                        'Propietario' => $permissions->pluck('id'),
                        'Administrador' => $permissions->whereNotIn('key', ['roles.manage'])->pluck('id'),
                        default => $permissions->where('key', 'dashboard.view')->pluck('id'),
                    };
                    $role->permissions()->syncWithPivotValues($keys, ['tenant_id' => $tenant->id]);
                    $roles[$name] = $role;
                }
                $user = new User(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);
                $user->tenant_id = $tenant->id;
                $user->role_id = $roles['Propietario']->id;
                $user->save();
                $branch = Branch::create(['name' => $data['branch_name'], 'code' => 'PRINCIPAL']);
                \App\Domains\Cash\DefaultRegister::create($branch);
                $theme = config('nexora.theme');
                WorkspaceSetting::create(['revision' => 1, 'theme' => $theme]);
                ThemeVersion::create(['version' => 1, 'schema_version' => 1, 'theme' => $theme, 'created_at' => now()]);
                Audit::record('company.created', 'Se creó el espacio de trabajo.', $user);

                return $user->refresh();
            });
        });
    }
}
