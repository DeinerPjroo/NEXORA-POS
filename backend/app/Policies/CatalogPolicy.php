<?php

namespace App\Policies;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;

final class CatalogPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('catalog.view');
    }

    public function view(User $user, Product|Category $record): bool
    {
        return $user->tenant_id === $record->tenant_id && $user->hasPermission('catalog.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('catalog.manage');
    }

    public function update(User $user, Product|Category $record): bool
    {
        return $user->tenant_id === $record->tenant_id && $user->hasPermission('catalog.manage');
    }
}
