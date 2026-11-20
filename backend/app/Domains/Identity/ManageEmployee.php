<?php

namespace App\Domains\Identity;

use App\Domains\Operations\IdempotentOperation;
use App\Models\Branch;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class ManageEmployee
{
    public function assertTarget(User $actor, User $target): void
    {
        abort_unless($target->tenant_id === $actor->tenant_id, 404);
        abort_if($target->id === $actor->id || $target->role->is_owner, 403, 'Esta cuenta está protegida. Usa tu configuración personal.');
        foreach ($target->role->permissions as $permission) {
            Gate::forUser($actor)->authorize($permission->key);
        }
        if (! $actor->all_branches) {
            abort_if($target->all_branches, 403);
            foreach (DB::table('employee_branches')->where('tenant_id', $actor->tenant_id)->where('user_id', $target->id)->pluck('branch_id') as $id) {
                abort_unless($actor->canAccessBranch($id), 403);
            }
        }
    }

    public function execute(User $actor, array $data, ?User $employee = null, bool $security = false): User
    {
        Gate::authorize($security ? 'team.credentials' : 'team.manage');
        if ($employee) {
            $this->assertTarget($actor, $employee);
        }

        return app(IdempotentOperation::class)->run($actor, 'employee.'.($security ? 'security' : 'save').'.'.($employee?->id ?? 'new'), $data, User::class, function ($data) use ($actor, $employee, $security) {
            $actor = User::where('tenant_id', $actor->tenant_id)->lockForUpdate()->findOrFail($actor->id);
            $actor->unsetRelation('role');
            Gate::forUser($actor)->authorize($security ? 'team.credentials' : 'team.manage');
            $target = $employee ? User::where('tenant_id', $actor->tenant_id)->lockForUpdate()->findOrFail($employee->id) : new User;
            if ($employee) {
                $this->assertTarget($actor, $target);
                abort_unless($target->employee_revision === (int) $data['revision'], 409, 'El empleado cambió. Actualiza antes de guardar.');
            }
            if ($security) {
                if ($data['action'] === 'password') {
                    $target->password = $data['password'];
                    DB::table('password_reset_tokens')->where('email', $target->email)->delete();
                }
                if ($data['clear_pin'] ?? false) {
                    $target->pin_hash = null;
                }
            } else {
                $role = Role::with('permissions')->findOrFail($data['role_id']);
                abort_if($role->is_owner, 403, 'No se pueden crear propietarios desde empleados.');
                foreach ($role->permissions as $permission) {
                    Gate::forUser($actor)->authorize($permission->key);
                }
                $branches = Branch::whereIn('id', $data['branch_ids'])->where('is_active', true)->get();
                abort_unless($branches->count() === count($data['branch_ids']), 422, 'Selecciona sucursales activas autorizadas.');
                if (User::where('email', $data['email'])->when($employee, fn ($q) => $q->whereKeyNot($target->id))->exists()) {
                    throw ValidationException::withMessages(['email' => 'No es posible utilizar este correo.']);
                }
                if ($employee && $target->email !== $data['email']) {
                    DB::table('password_reset_tokens')->where('email', $target->email)->delete();
                    $target->email_verified_at = null;
                }
                $target->fill(['name' => $data['name'], 'email' => $data['email']]);
                $target->tenant_id = $actor->tenant_id;
                $target->role_id = $role->id;
                $target->is_active = $data['is_active'];
                $target->all_branches = false;
                if (! $employee) {
                    $target->password = $data['password'];
                    $target->pin_hash = empty($data['pin']) ? null : Hash::make($data['pin']);
                }
            }
            $target->employee_revision = $employee ? $target->employee_revision + 1 : 1;
            if ($employee) {
                $target->mfa_version++;
                $target->security_revision++;
                $target->remember_token = Str::random(60);
            }
            $target->save();
            if (! $security) {
                $target->branches()->syncWithPivotValues($data['branch_ids'], ['tenant_id' => $actor->tenant_id]);
            }
            if ($employee) {
                DB::table('sessions')->where('user_id', $target->id)->delete();
                DB::table('screen_locks')->where('tenant_id', $actor->tenant_id)->where('user_id', $target->id)->delete();
            }
            Audit::record($security ? 'employee.'.$data['action'] : 'employee.saved', 'Se actualizaron los accesos de un empleado.', $actor, ['employee_id' => $target->id, 'revision' => $target->employee_revision]);

            return $target;
        });
    }
}
