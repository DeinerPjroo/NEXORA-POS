<?php

namespace App\Domains\Studio;

use Illuminate\Support\Facades\Validator;

final class PrintLayoutSchema
{
    public static function defaults(): array
    {
        return ['schema_version' => 1, 'tokens' => ['paper_width' => 80, 'font_size' => 12, 'line_height' => 140, 'spacing' => 4], 'options' => ['center_header' => true], 'texts' => ['footer' => '']];
    }

    public static function validate(array $config): array
    {
        Validator::make(['config' => $config], [
            'config' => ['required', 'array:schema_version,tokens,options,texts'], 'config.schema_version' => ['required', 'integer', 'in:1'],
            'config.tokens' => ['required', 'array:paper_width,font_size,line_height,spacing'], 'config.tokens.paper_width' => ['required', 'integer', 'in:58,80'],
            'config.tokens.font_size' => ['required', 'integer', 'between:10,16'], 'config.tokens.line_height' => ['required', 'integer', 'between:120,170'], 'config.tokens.spacing' => ['required', 'integer', 'between:2,8'],
            'config.options' => ['required', 'array:center_header'], 'config.options.center_header' => ['required', 'boolean'],
            'config.texts' => ['required', 'array:footer'], 'config.texts.footer' => ['present', 'nullable', 'string', 'max:180'],
        ])->validate();
        foreach (['paper_width', 'font_size', 'line_height', 'spacing'] as $key) {
            $config['tokens'][$key] = (int) $config['tokens'][$key];
        }
        $config['options']['center_header'] = (bool) $config['options']['center_header'];
        $config['texts']['footer'] = trim($config['texts']['footer'] ?? '');
        $config['schema_version'] = 1;

        return $config;
    }
}
