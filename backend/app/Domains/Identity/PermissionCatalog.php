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
        'cash.view' => ['Consultar caja', 'Caja'],
        'cash.manage' => ['Administrar y abrir/cerrar caja', 'Caja'],
        'cash.movements' => ['Registrar movimientos manuales', 'Caja'],
        'orders.view' => ['Consultar pedidos', 'Pedidos'],
        'orders.manage' => ['Crear y preparar pedidos', 'Pedidos'],
        'orders.cancel' => ['Cancelar pedidos', 'Pedidos'],
        'sales.view' => ['Consultar ventas y recibos', 'Ventas'],
        'sales.collect' => ['Cobrar pedidos en efectivo', 'Ventas'],
        'sales.configure' => ['Configurar cálculo de ventas', 'Ventas'],
        'sales.discount' => ['Aplicar descuentos', 'Ventas'],
        'sales.refund' => ['Registrar devoluciones parciales y totales', 'Ventas'],
        'sales.tips' => ['Registrar propinas voluntarias', 'Ventas'],
    ];

    public static function seed(): void
    {
        foreach (self::ALL as $key => [$name, $group]) {
            Permission::updateOrCreate(['key' => $key], ['name' => $name, 'group' => $group]);
        }
    }
}
