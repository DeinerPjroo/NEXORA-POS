<?php

namespace App\Domains\Identity;

use App\Models\Permission;

final class PermissionCatalog
{
    public const ALL = [
        'dashboard.view' => ['Ver resumen', 'Espacio de trabajo'],
        'branches.view' => ['Consultar sucursales', 'Sucursales'],
        'branches.manage' => ['Administrar sucursales', 'Sucursales'],
        'team.view' => ['Consultar equipo', 'Equipo'],
        'roles.view' => ['Consultar roles', 'Equipo'],
        'roles.manage' => ['Administrar roles', 'Equipo'],
        'settings.view' => ['Consultar configuración', 'Configuración'],
        'settings.manage' => ['Editar empresa', 'Configuración'],
        'studio.view' => ['Ver identidad visual', 'Nexora Studio'],
        'studio.manage' => ['Publicar identidad visual', 'Nexora Studio'],
        'audit.view' => ['Consultar actividad', 'Seguridad'],
        'catalog.view' => ['Consultar catálogo', 'Catálogo'],
        'catalog.manage' => ['Administrar catálogo', 'Catálogo'],
        'catalog.costs' => ['Consultar y editar costos del catálogo', 'Catálogo'],
    ];

    public static function seed(): void
    {
        foreach (self::ALL as $key => [$name, $group]) {
            Permission::updateOrCreate(['key' => $key], ['name' => $name, 'group' => $group]);
        }
    }
}
