<?php

namespace App\Domains\Studio;

use Illuminate\Support\Facades\Validator;

final class DeliveriesLayoutSchema
{
    public static function defaults(): array
    {
        return ['schema_version' => 1, 'tokens' => ['detail_width' => 520, 'card_width' => 230, 'font_size' => 16, 'gap' => 9, 'radius' => 9, 'pending' => '#cb922f', 'assigned' => '#258ca7', 'out_for_delivery' => '#7255db', 'delivered' => '#209b79', 'cancelled' => '#cc5365']];
    }

    public static function validate(array $config): array
    {
        $rules = ['config' => ['required', 'array:schema_version,tokens'], 'config.schema_version' => ['required', 'integer', 'in:1'], 'config.tokens' => ['required', 'array:detail_width,card_width,font_size,gap,radius,pending,assigned,out_for_delivery,delivered,cancelled']];
        foreach (['detail_width' => '420,680', 'card_width' => '205,320', 'font_size' => '14,20', 'gap' => '6,16', 'radius' => '4,16'] as $key => $bounds) {
            $rules['config.tokens.'.$key] = ['required', 'integer', 'between:'.$bounds];
        }
        foreach (['pending', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'] as $key) {
            $rules['config.tokens.'.$key] = ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/D'];
        }
        Validator::make(['config' => $config], $rules)->validate();
        foreach (['detail_width', 'card_width', 'font_size', 'gap', 'radius'] as $key) {
            $config['tokens'][$key] = (int) $config['tokens'][$key];
        }
        $config['schema_version'] = 1;

        return $config;
    }
}
