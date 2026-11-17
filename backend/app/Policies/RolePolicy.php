<?php

namespace App\Policies;

use App\Models\Role;
use App\Models\User;

final class RolePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('roles.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('roles.manage');
    }

    public function update(User $user, Role $role): bool
    {
        return $user->tenant_id === $role->tenant_id && ! $role->is_owner
            && $user->role_id !== $role->id && $user->hasPermission('roles.manage');
    }
}
