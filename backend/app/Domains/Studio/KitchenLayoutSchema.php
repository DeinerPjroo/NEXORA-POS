<?php

namespace App\Domains\Studio;

use Illuminate\Support\Facades\Validator;

final class KitchenLayoutSchema
{
    public static function defaults(): array
    {
        return ['schema_version' => 1, 'tokens' => ['column_width' => 250, 'font_size' => 16, 'padding' => 14, 'gap' => 12, 'radius' => 12, 'new_color' => '#7258cf', 'preparing_color' => '#a86f13', 'ready_color' => '#148765']];
    }

    public static function validate(array $config): array
    {
        $rules = ['config' => ['required', 'array:schema_version,tokens'], 'config.schema_version' => ['required', 'integer', 'in:1'], 'config.tokens' => ['required', 'array:column_width,font_size,padding,gap,radius,new_color,preparing_color,ready_color']];
        foreach (['column_width' => '230,360', 'font_size' => '14,20', 'padding' => '8,18', 'gap' => '6,16', 'radius' => '4,16'] as $key => $bounds) {
            $rules['config.tokens.'.$key] = ['required', 'integer', 'between:'.$bounds];
        }
        foreach (['new_color', 'preparing_color', 'ready_color'] as $key) {
            $rules['config.tokens.'.$key] = ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/D'];
        }
        Validator::make(['config' => $config], $rules)->validate();
        foreach (['column_width', 'font_size', 'padding', 'gap', 'radius'] as $key) {
            $config['tokens'][$key] = (int) $config['tokens'][$key];
        }
        $config['schema_version'] = 1;

        return $config;
    }
}
