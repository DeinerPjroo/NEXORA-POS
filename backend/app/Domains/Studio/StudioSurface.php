<?php

namespace App\Domains\Studio;

final class StudioSurface
{
    public static function name(array $data): string
    {
        $surface = $data['surface'] ?? 'pos';
        abort_unless(in_array($surface, ['pos', 'tables', 'kitchen'], true), 422);

        return $surface;
    }

    public static function defaults(string $surface, string $device = 'adaptive'): array
    {
        return match ($surface) {
            'tables' => TablesLayoutSchema::defaults(), 'kitchen' => KitchenLayoutSchema::defaults(), default => LayoutScope::defaults($device)
        };
    }

    public static function validate(array $config, string $surface, string $device): array
    {
        return match ($surface) {
            'tables' => TablesLayoutSchema::validate($config), 'kitchen' => KitchenLayoutSchema::validate($config), default => LayoutScope::validateConfiguration($config, $device)
        };
    }
}
