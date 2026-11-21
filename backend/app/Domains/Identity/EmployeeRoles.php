<?php

namespace App\Domains\Identity;

final class EmployeeRoles
{
    public const PRESETS = [
        'Cajero' => ['customers.view', 'customers.manage', 'catalog.view', 'orders.view', 'orders.manage', 'sales.collect', 'cash.view', 'cash.manage', 'dining.view', 'dining.operate'],
        'Mesero' => ['customers.view', 'customers.manage', 'catalog.view', 'orders.view', 'orders.manage', 'dining.view', 'dining.operate'],
        'Cocinero' => ['kitchen.view', 'kitchen.operate'],
        'Repartidor' => ['orders.view', 'deliveries.operate'],
        'Supervisor' => ['customers.view', 'customers.manage', 'catalog.view', 'orders.view', 'orders.manage', 'orders.cancel', 'dining.view', 'dining.operate', 'dining.reserve', 'kitchen.view', 'kitchen.operate', 'sales.view', 'sales.collect', 'cash.view'],
    ];
}
