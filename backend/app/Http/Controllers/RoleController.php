<?php

namespace App\Http\Controllers;

use App\Domains\Identity\Audit;
use App\Http\Requests\RoleRequest;
use App\Models\Permission;
use App\Models\Role;
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
            $role ??= new Role;
            $role->name = $data['name'];
            $role->save();
            $role->permissions()->syncWithPivotValues(Permission::whereIn('key', $data['permissions'])->pluck('id'), ['tenant_id' => $request->user()->tenant_id]);
            Audit::record('role.saved', 'Se guardó el rol '.$role->name.'.', $request->user(), ['role_id' => $role->id, 'permissions' => $data['permissions']]);

            return $role->load('permissions');
        });
    }
}
