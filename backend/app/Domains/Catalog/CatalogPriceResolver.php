<?php

namespace App\Domains\Catalog;

use App\Domains\Operations\Money;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductContextPrice;
use App\Models\ProductVariant;
use Illuminate\Support\Collection;

final class CatalogPriceResolver
{
    public function candidates(array $productIds, array $variantIds, int $branchId, string $channel): Collection
    {
        return ProductContextPrice::whereIn('product_id', $productIds)->whereIn('variant_scope', array_unique([0, ...$variantIds]))
            ->whereIn('branch_scope', [0, $branchId])->whereIn('channel', ['all', $channel])->where('is_active', true)->get();
    }

    public function resolve(Product $product, ?ProductVariant $variant, Branch $branch, string $channel, Collection $candidates): array
    {
        $rule = $candidates->filter(fn ($rule) => (int) $rule->product_id === $product->id && $rule->variant_scope === ($variant?->id ?? 0) && $rule->is_active && in_array($rule->branch_scope, [0, $branch->id], true) && in_array($rule->channel, ['all', $channel], true))
            ->sortByDesc(fn ($rule) => ($rule->branch_scope ? 2 : 0) + ($rule->channel === 'all' ? 0 : 1))->first();

        return ['version' => 1, 'source' => $rule ? 'rule' : ($variant ? 'variant' : 'product'), 'rule_id' => $rule?->id, 'rule_revision' => $rule?->revision,
            'amount' => Money::normalize($rule?->amount ?? $variant?->sale_price ?? $product->sale_price),
            'branch_id' => $branch->id, 'branch_name' => $branch->name, 'channel' => $channel, 'variant_id' => $variant?->id,
            'scope_branch_id' => $rule?->branch_id, 'scope_channel' => $rule?->channel];
    }
}
