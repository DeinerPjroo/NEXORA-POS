<?php

namespace App\Domains\Studio;

final class StudioSurface
{
    public static function name(array $data): string
    {
        $surface = $data['surface'] ?? 'pos';
        abort_unless(in_array($surface, ['pos', 'tables'], true), 422);

        return $surface;
    }

    public static function defaults(string $surface, string $device = 'adaptive'): array
    {
        return $surface === 'tables' ? TablesLayoutSchema::defaults() : LayoutScope::defaults($device);
    }

    public static function validate(array $config, string $surface, string $device): array
    {
        return $surface === 'tables' ? TablesLayoutSchema::validate($config) : LayoutScope::validateConfiguration($config, $device);
    }
}
