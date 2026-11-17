<?php

namespace App\Domains\Catalog;

final class CatalogSearch
{
    public static function pattern(string $search): string
    {
        return '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search).'%';
    }
}
