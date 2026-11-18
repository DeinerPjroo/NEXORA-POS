<?php

namespace App\Domains\Catalog;

use App\Models\Category;

final class CategoryHierarchy
{
    public function validate(Category $category, array $data): void
    {
        if (! array_key_exists('parent_id', $data) || $data['parent_id'] === null) {
            return;
        }
        abort_if($category->exists && $category->id === (int) $data['parent_id'], 422, 'Una categoría no puede ser su propia principal.');
        $parent = Category::whereKey($data['parent_id'])->lockForUpdate()->firstOrFail();
        abort_if($parent->parent_id !== null, 422, 'Elige una categoría principal: el catálogo admite dos niveles.');
        abort_if($category->exists && $category->children()->exists(), 422, 'Esta categoría tiene subcategorías. Reasígnalas antes de convertirla en subcategoría.');
        abort_if($parent->revision !== (int) $data['parent_revision'], 409, 'La categoría principal cambió. Revisa la selección antes de guardar.');
    }
}
