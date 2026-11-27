<?php

namespace App\Domains\Studio;

use Illuminate\Support\Facades\Validator;

final class DashboardLayoutSchema
{
    public const WIDGETS = ['totals', 'live', 'chart', 'methods', 'products'];

    public static function defaults(): array
    {
        return ['schema_version' => 1, 'widgets' => self::WIDGETS, 'tokens' => ['columns' => 3, 'gap' => 16, 'radius' => 12, 'font_size' => 16, 'accent' => '#7258df'], 'options' => array_fill_keys(self::WIDGETS, true)];
    }

    public static function validate(array $config): array
    {
        $rules = ['config' => ['required', 'array:schema_version,widgets,tokens,options'], 'config.schema_version' => ['required', 'integer', 'in:1'], 'config.widgets' => ['required', 'array', 'list', 'size:5'], 'config.widgets.*' => ['required', 'string', 'distinct', 'in:'.implode(',', self::WIDGETS)], 'config.tokens' => ['required', 'array:columns,gap,radius,font_size,accent'], 'config.tokens.accent' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/D'], 'config.options' => ['required', 'array:'.implode(',', self::WIDGETS)]];
        foreach (['columns' => '2,4', 'gap' => '8,24', 'radius' => '4,20', 'font_size' => '14,20'] as $key => $bounds) {
            $rules['config.tokens.'.$key] = ['required', 'integer', 'between:'.$bounds];
        }
        foreach (self::WIDGETS as $key) {
            $rules['config.options.'.$key] = ['required', 'boolean'];
        }
        Validator::make(['config' => $config], $rules)->validate();
        foreach (['columns', 'gap', 'radius', 'font_size'] as $key) {
            $config['tokens'][$key] = (int) $config['tokens'][$key];
        }
        foreach (self::WIDGETS as $key) {
            $config['options'][$key] = (bool) $config['options'][$key];
        }
        $config['schema_version'] = 1;

        return $config;
    }
}
