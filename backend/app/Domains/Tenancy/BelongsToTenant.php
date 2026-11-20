<?php

namespace App\Domains\Tenancy;

use Illuminate\Database\Eloquent\Builder;
use LogicException;

trait BelongsToTenant
{
    protected static function bootBelongsToTenant(): void
    {
        static::addGlobalScope('tenant', function (Builder $query) {
            $query->where($query->getModel()->qualifyColumn('tenant_id'), app(TenantContext::class)->id());
            app(BranchAccess::class)->apply($query);
        });
        static::creating(function ($model) {
            $id = app(TenantContext::class)->id();
            if (isset($model->tenant_id) && (int) $model->tenant_id !== $id) {
                throw new LogicException('La empresa del registro no coincide con el contexto.');
            }
            $model->tenant_id = $id;
            app(BranchAccess::class)->assertWrite($model);
        });
        static::updating(function ($model) {
            app(BranchAccess::class)->assertWrite($model);
            if ($model->isDirty('tenant_id') || (int) $model->tenant_id !== app(TenantContext::class)->id()) {
                throw new LogicException('No se permite transferir registros entre empresas.');
            }
        });
        static::deleting(function ($model) {
            if ((int) $model->tenant_id !== app(TenantContext::class)->id()) {
                throw new LogicException('Empresa incorrecta.');
            }
        });
    }
}
