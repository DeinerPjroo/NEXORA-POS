<?php

namespace App\Domains\Studio;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

final class PosLayoutSchema
{
    public const PANELS = ['actions', 'order', 'categories', 'products'];

    public static function defaults(): array
    {
        return ['schema_version' => 2, 'panels' => self::PANELS, 'tokens' => ['order_width' => 480, 'category_width' => 110, 'product_columns' => 3, 'card_height' => 86, 'gap' => 10, 'radius' => 8, 'font_size' => 14, 'accent' => '#7258df'], 'options' => ['photos' => false, 'hints' => true, 'theme' => 'inherit']];
    }

    public static function validate(array $config): array
    {
        Validator::make(['config' => $config], [
            'config' => ['required', 'array:schema_version,panels,tokens,options'],
            'config.schema_version' => ['required', 'integer', 'in:1,2'],
            'config.panels' => ['required', 'array', 'size:4', 'list'],
            'config.panels.*' => ['required', 'string', 'distinct', 'in:actions,order,categories,products'],
            'config.tokens' => ['required', 'array:order_width,category_width,product_columns,card_height,gap,radius,font_size,accent'],
            'config.tokens.order_width' => ['required', 'integer', 'between:320,560'],
            'config.tokens.category_width' => ['required', 'integer', 'between:90,150'],
            'config.tokens.product_columns' => ['required', 'integer', 'between:2,4'],
            'config.tokens.card_height' => ['required', 'integer', 'between:80,104'],
            'config.tokens.gap' => ['required', 'integer', 'between:6,14'],
            'config.tokens.radius' => ['required', 'integer', 'between:0,16'],
            'config.tokens.font_size' => ['required', 'integer', 'between:14,18'],
            'config.tokens.accent' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/D'],
            'config.options' => ['required', (int) ($config['schema_version'] ?? 0) === 1 ? 'array:photos,hints' : 'array:photos,hints,theme'],
            'config.options.photos' => ['required', 'boolean'],
            'config.options.hints' => ['required', 'boolean'],
            'config.options.theme' => [Rule::requiredIf((int) ($config['schema_version'] ?? 0) === 2), Rule::in(['inherit', 'light', 'dark'])],
        ])->validate();

        $config['schema_version'] = 2;
        $config['options']['theme'] ??= 'inherit';
        foreach (['order_width', 'category_width', 'product_columns', 'card_height', 'gap', 'radius', 'font_size'] as $key) {
            $config['tokens'][$key] = (int) $config['tokens'][$key];
        }
        foreach (['photos', 'hints'] as $key) {
            $config['options'][$key] = (bool) $config['options'][$key];
        }

        return $config;
    }
}
