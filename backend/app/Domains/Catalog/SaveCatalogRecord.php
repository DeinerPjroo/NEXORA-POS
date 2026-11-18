<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Models\Category;
use App\Models\Product;
use App\Models\TaxProfile;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class SaveCatalogRecord
{
    public function execute(array $data, User $actor, Product|Category $record): Product|Category
    {
        return DB::transaction(function () use ($data, $actor, $record) {
            $company = Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
            if ($record instanceof Product) {
                // El cambio de moneda comparte el mismo bloqueo; nunca reinterpretar precios existentes.
                abort_if($company->currency !== $data['currency'], 409, 'La moneda de la empresa cambió. Recarga el espacio antes de guardar precios.');
                CatalogIdentifiers::assertAvailable($data['sku'], $data['barcode'] ?? $record->barcode, $record->exists ? $record->id : null);
            }
            $existing = $record->exists;
            if ($existing) {
                $record = $record->newQuery()->lockForUpdate()->findOrFail($record->id);
                Gate::authorize('update', $record);
                abort_if($record->revision !== (int) $data['revision'], 409, 'Este registro cambió en otra sesión. Actualiza los datos antes de guardar.');
                $record->revision++;
            }
            if ($record instanceof Product && isset($data['tax_profile_id'])) {
                $profile = TaxProfile::whereKey($data['tax_profile_id'])->lockForUpdate()->firstOrFail();
                abort_unless($profile->is_active && $profile->revision === (int) $data['tax_profile_revision'], 409, 'El perfil de impuestos cambió o está archivado. Revisa la selección.');
            }
            if ($record instanceof Category) {
                app(CategoryHierarchy::class)->validate($record, $data);
            }
            unset($data['revision'], $data['currency'], $data['tax_profile_revision'], $data['parent_revision']);
            $record->fill($data)->save();
            $kind = $record instanceof Product ? 'product' : 'category';
            Audit::record('catalog.'.$kind.'.'.($existing ? 'updated' : 'created'), ($kind === 'product' ? 'Producto' : 'Categoría').' «'.$record->name.'» '.($existing ? 'actualizado' : 'creado').'.', $actor, ['id' => $record->id, 'revision' => $record->revision ?? 1]);

            return $record->refresh();
        });
    }
}
