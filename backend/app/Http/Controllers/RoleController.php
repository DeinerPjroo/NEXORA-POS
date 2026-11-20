<?php

namespace App\Http\Controllers;

use App\Domains\Identity\Audit;
use App\Domains\Identity\ManageEmployee;
use App\Http\Requests\RoleRequest;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class RoleController extends Controller
{
    public function index()
    {
        Gate::authorize('viewAny', Role::class);

        return ['roles' => Role::with('permissions')->orderBy('id')->get(), 'permissions' => Permission::all()];
    }

    public function store(RoleRequest $request)
    {
        Gate::authorize('create', Role::class);

        return response()->json($this->save($request), 201);
    }

    public function update(RoleRequest $request, Role $role)
    {
        Gate::authorize('update', $role);

        return $this->save($request, $role);
    }

    private function save(RoleRequest $request, ?Role $role = null): Role
    {
        $data = $request->validated();
        foreach ($data['permissions'] as $key) {
            Gate::authorize($key);
        }

        return DB::transaction(function () use ($request, $role, $data) {
            Tenant::whereKey($request->user()->tenant_id)->lockForUpdate()->firstOrFail();
            $actor = User::where('tenant_id', $request->user()->tenant_id)->findOrFail($request->user()->id);
            Gate::forUser($actor)->authorize($role ? 'update' : 'create', $role ?? Role::class);
            foreach ($data['permissions'] as $key) {
                Gate::forUser($actor)->authorize($key);
            }
            $existing = $role !== null;
            if ($role) {
                $role = Role::with('permissions')->lockForUpdate()->findOrFail($role->id);
                abort_unless($role->revision === (int) $data['revision'], 409, 'El rol cambió. Actualiza antes de guardar.');
                foreach ($role->permissions as $permission) {
                    Gate::forUser($actor)->authorize($permission->key);
                }
                if (! $actor->all_branches) {
                    foreach (User::where('tenant_id', $actor->tenant_id)->where('role_id', $role->id)->get() as $member) {
                        app(ManageEmployee::class)->assertTarget($actor, $member);
                    }
                }
            }
            $role ??= new Role;
            $role->name = $data['name'];
            $role->revision = $existing ? $role->revision + 1 : 1;
            $role->save();
            $role->permissions()->syncWithPivotValues(Permission::whereIn('key', $data['permissions'])->pluck('id'), ['tenant_id' => $request->user()->tenant_id]);
            if ($existing) {
                $users = User::where('tenant_id', $actor->tenant_id)->where('role_id', $role->id);
                $ids = $users->pluck('id');
                $users->update(['mfa_version' => DB::raw('mfa_version + 1'), 'employee_revision' => DB::raw('employee_revision + 1')]);
                DB::table('sessions')->whereIn('user_id', $ids)->delete();
                DB::table('screen_locks')->where('tenant_id', $actor->tenant_id)->whereIn('user_id', $ids)->delete();
            }
            Audit::record('role.saved', 'Se guardó el rol '.$role->name.'.', $request->user(), ['role_id' => $role->id, 'permissions' => $data['permissions']]);

            return $role->load('permissions');
        });
    }
}
