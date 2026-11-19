<?php

namespace App\Domains\Catalog;

use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductVariant;
use Carbon\CarbonImmutable;

final class CatalogPricing
{
    public function candidates(array $productIds, array $variantIds, int $branchId, string $channel, string $timezone, ?CarbonImmutable $instant = null): array
    {
        return ['prices' => app(CatalogPriceResolver::class)->candidates($productIds, $variantIds, $branchId, $channel),
            'promotions' => app(PromotionResolver::class)->candidates($productIds, $variantIds, $branchId, $channel), 'timezone' => $timezone, 'instant' => $instant ?? CarbonImmutable::now()];
    }

    public function resolve(Product $product, ?ProductVariant $variant, Branch $branch, string $channel, array $candidates, bool $promotions = true): array
    {
        $context = app(CatalogPriceResolver::class)->resolve($product, $variant, $branch, $channel, $candidates['prices']);

        return $promotions ? app(PromotionResolver::class)->apply($context, $product->id, $candidates['promotions'], $candidates['instant'], $candidates['timezone']) : $context;
    }
}
