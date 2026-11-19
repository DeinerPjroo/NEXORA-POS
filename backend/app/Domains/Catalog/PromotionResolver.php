<?php

namespace App\Domains\Catalog;

use App\Domains\Operations\Money;
use App\Models\ProductPromotion;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class PromotionResolver
{
    public function candidates(array $productIds, array $variantIds, int $branchId, string $channel): Collection
    {
        return ProductPromotion::whereIn('product_id', $productIds)->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('variant_id')->orWhereIn('variant_id', $variantIds))
            ->where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $branchId))->whereIn('channel', ['all', $channel])->get();
    }

    public function apply(array $context, int $productId, Collection $candidates, CarbonImmutable $instant, string $timezone): array
    {
        $date = $instant->setTimezone($timezone)->toDateString();
        $rule = $candidates->filter(fn ($rule) => $rule->product_id === $productId && $rule->variant_id === $context['variant_id'] && $rule->is_active
            && ($rule->branch_id === null || $rule->branch_id === $context['branch_id']) && in_array($rule->channel, ['all', $context['channel']], true)
            && (! $rule->valid_from || $date >= $rule->valid_from) && (! $rule->valid_until || $date <= $rule->valid_until))
            ->sort(fn ($a, $b) => [-(($a->branch_id ? 2 : 0) + ($a->channel === 'all' ? 0 : 1)), $a->priority, $a->id]
                <=> [-(($b->branch_id ? 2 : 0) + ($b->channel === 'all' ? 0 : 1)), $b->priority, $b->id])->first();
        if (! $rule) {
            return $context;
        }
        $base = $context['amount'];
        $discount = $rule->discount_type === 'percentage' ? bcadd(bcdiv(bcmul($base, $rule->discount_value, 10), '100', 10), '0.00005', 4) : $rule->discount_value;
        $discount = bccomp($discount, $base, 4) > 0 ? $base : Money::normalize($discount);

        return [...$context, 'version' => 2, 'base_amount' => $base, 'amount' => Money::bounded(bcsub($base, $discount, 4)),
            'promotion' => [...$rule->only('id', 'name', 'revision', 'discount_type', 'discount_value', 'priority', 'valid_from', 'valid_until'), 'discount_amount' => $discount,
                'scope_branch_id' => $rule->branch_id, 'scope_channel' => $rule->channel, 'timezone' => $timezone, 'local_date' => $date]];
    }
}
