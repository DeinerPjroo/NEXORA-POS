<?php

namespace App\Domains\Studio;

use App\Models\Role;
use App\Models\StudioLayout;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

final class LayoutScope
{
    public const DEVICES = ['adaptive', 'desktop', 'tablet', 'mobile'];

    public static function query(array $data): Builder
    {
        abort_unless(in_array($data['device'] ?? 'adaptive', self::DEVICES, true), 422, 'Dispositivo de diseño no válido.');
        $role = $data['role_id'] ?? null;
        if ($role !== null) {
            Gate::authorize('roles.view');
            Role::whereKey($role)->firstOrFail();
        }

        return StudioLayout::where('surface', StudioSurface::name($data))->whereNull('branch_id')->where('device', $data['device'] ?? 'adaptive')->when($role !== null, fn ($q) => $q->where('role_id', $role), fn ($q) => $q->whereNull('role_id'));
    }

    public static function identity(array $data): array
    {
        return ['surface' => StudioSurface::name($data), 'device' => $data['device'] ?? 'adaptive', 'role_id' => $data['role_id'] ?? null];
    }

    public static function validateConfiguration(array $config, string $device): array
    {
        $config = PosLayoutSchema::validate($config);
        abort_if(in_array($device, ['tablet', 'mobile'], true) && $config['tokens']['product_columns'] !== 2, 422, 'Tablet y móvil usan dos columnas para conservar controles accesibles.');
        abort_if($device === 'mobile' && $config['panels'] !== PosLayoutSchema::PANELS, 422, 'Móvil conserva la navegación operativa por paneles.');

        return $config;
    }

    public static function defaults(string $device): array
    {
        $config = PosLayoutSchema::defaults();
        if (in_array($device, ['tablet', 'mobile'], true)) {
            $config['tokens']['product_columns'] = 2;
        }

        return $config;
    }
}
