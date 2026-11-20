<?php

namespace App\Http\Controllers;

use App\Domains\Identity\ManageEmployee;
use App\Http\Requests\EmployeeRequest;
use App\Models\Branch;
use App\Models\Role;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class EmployeeController extends Controller
{
    public function options(Request $request)
    {
        Gate::authorize('team.manage');

        return ['roles' => Role::with('permissions')->where('is_owner', false)->get()->filter(fn ($role) => $role->permissions->every(fn ($p) => $request->user()->can($p->key)))->values(), 'branches' => Branch::where('is_active', true)->get(['id', 'name'])];
    }

    public function store(EmployeeRequest $request, ManageEmployee $service)
    {
        return response()->json(['data' => $this->present($service->execute($request->user(), $request->validated()))], 201);
    }

    public function update(EmployeeRequest $request, int $employee, ManageEmployee $service)
    {
        $target = User::where('tenant_id', $request->user()->tenant_id)->findOrFail($employee);

        return ['data' => $this->present($service->execute($request->user(), $request->validated(), $target, $request->routeIs('employees.security')))];
    }

    public function present(User $user): array
    {
        $manageable = true;
        try {
            app(ManageEmployee::class)->assertTarget(request()->user(), $user);
        } catch (AuthorizationException|HttpException $e) {
            $manageable = false;
        }

        return [...$user->only(['id', 'name', 'email', 'is_active', 'employee_revision', 'all_branches', 'created_at']), 'role' => $user->role->only(['id', 'name', 'is_owner']), 'branches' => $user->branches()->get(['branches.id', 'branches.name']), 'pin_enabled' => $user->pin_hash !== null, 'can_manage' => $manageable && request()->user()->can('team.manage'), 'can_credentials' => $manageable && request()->user()->can('team.credentials')];
    }
}
