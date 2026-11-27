<?php

namespace App\Domains\Studio;

use Illuminate\Support\Facades\Validator;

final class TablesLayoutSchema
{
    public static function defaults(): array
    {
        return ['schema_version' => 1, 'tokens' => ['card_width' => 160, 'card_height' => 156, 'gap' => 9, 'radius' => 10, 'font_size' => 14, 'available' => '#20a68a', 'occupied' => '#dc9940', 'paid' => '#7258df'], 'options' => ['capacity' => true, 'symbol' => true]];
    }

    public static function validate(array $config): array
    {
        $rules = ['config' => ['required', 'array:schema_version,tokens,options'], 'config.schema_version' => ['required', 'integer', 'in:1'], 'config.tokens' => ['required', 'array:card_width,card_height,gap,radius,font_size,available,occupied,paid'], 'config.options' => ['required', 'array:capacity,symbol']];
        foreach (['card_width' => '130,240', 'card_height' => '130,200', 'gap' => '6,16', 'radius' => '4,16', 'font_size' => '14,20'] as $key => $bounds) {
            $rules['config.tokens.'.$key] = ['required', 'integer', 'between:'.$bounds];
        }
        foreach (['available', 'occupied', 'paid'] as $key) {
            $rules['config.tokens.'.$key] = ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/D'];
        }
        foreach (['capacity', 'symbol'] as $key) {
            $rules['config.options.'.$key] = ['required', 'boolean'];
        }
        Validator::make(['config' => $config], $rules)->validate();
        foreach (['card_width', 'card_height', 'gap', 'radius', 'font_size'] as $key) {
            $config['tokens'][$key] = (int) $config['tokens'][$key];
        }
        foreach (['capacity', 'symbol'] as $key) {
            $config['options'][$key] = (bool) $config['options'][$key];
        }
        $config['schema_version'] = 1;

        return $config;
    }
}
