<?php

namespace App\Domains\Orders;

use App\Domains\Operations\Money;
use App\Domains\Sales\CentAllocation;
use App\Models\Product;

final class OrderComboPlan
{
    public function build(OrderCatalog $catalog, Product $root, array $line, bool $expectations): array
    {
        abort_unless(($line['kind'] ?? null) === 'combo' && empty($line['variant_id']) && empty($line['modifiers']), 422, 'Configura el combo con sus componentes; no se puede registrar como producto individual.');
        abort_unless(in_array($root->combo_allocation_mode, ['equal', 'proportional'], true), 409, 'El combo necesita una política de reparto de precio.');
        $rootPlan = $catalog->resolve($root, null, $line, $expectations, false);
        $components = $catalog->components->where('product_id', $root->id)->values();
        $units = $components->sum('units');
        abort_unless($units > 0 && $units <= 20 && count($line['components'] ?? []) === $units, 409, 'La composición del combo cambió. Revisa todos sus componentes.');
        $chosen = [];
        foreach ($line['components'] as $selection) {
            $key = $selection['component_id'].':'.$selection['unit_index'];
            abort_if(isset($chosen[$key]), 422, 'No repitas una unidad de componente.');
            $chosen[$key] = $selection;
        }
        $plans = [];
        $weights = [];
        foreach ($components as $component) {
            $leaf = $catalog->products->get($component->component_product_id);
            abort_unless($leaf && $leaf->kind === 'regular', 409, 'Un componente ya no corresponde a un producto individual.');
            for ($unit = 0; $unit < $component->units; $unit++) {
                $selection = $chosen[$component->id.':'.$unit] ?? null;
                abort_unless($selection, 409, 'La composición del combo cambió. Revisa la selección.');
                $plan = $catalog->resolve($leaf, $component->component_variant_id, [...$selection, 'quantity' => $line['quantity']], $expectations, false, true);
                $plan['component'] = $component;
                $plan['unit_index'] = $unit;
                $plans[] = $plan;
                $weights[] = $root->combo_allocation_mode === 'equal' ? '1' : bcmul($plan['item']['price_snapshot']['amount'], '10000', 0);
            }
        }
        $base = $rootPlan['item']['base_unit_price'];
        abort_if(bccomp($base, '0', 4) > 0 && array_reduce($weights, fn ($sum, $weight) => bcadd($sum, $weight, 0), '0') === '0', 409, 'No hay bases positivas para repartir proporcionalmente. Revisa el reparto del combo.');
        $shares = CentAllocation::distribute(bcmul($base, '10000', 0), $weights);
        $items = [];
        $previews = [];
        $composition = [];
        $price = '0.0000';
        foreach ($plans as $index => $plan) {
            $allocated = bcdiv($shares[$index], '10000', 4);
            $extra = $plan['item']['unit_price'];
            $unitPrice = Money::bounded(bcadd($allocated, $extra, 4));
            $price = Money::bounded(bcadd($price, $unitPrice, 4));
            $item = [...$plan['item'], 'base_unit_price' => $allocated, 'unit_price' => $unitPrice, 'line_subtotal' => Money::bounded(bcmul($unitPrice, (string) $line['quantity'], 4)), 'combo_position' => $index + 1];
            $item['price_snapshot'] = [...$item['price_snapshot'], 'usage' => 'combo_reference', 'allocated_amount' => $allocated];
            $items[] = $item;
            $identity = ['component_id' => $plan['component']->id, 'unit_index' => $plan['unit_index']];
            $previews[] = [...$plan['preview'], ...$identity, 'base_unit_price' => $allocated, 'expected_unit_price' => $unitPrice, 'price_context' => $item['price_snapshot']];
            $composition[] = [...$identity, 'component_revision' => $plan['component']->revision, 'position' => $index + 1, 'product_id' => $item['product_id'], 'variant_id' => $item['variant_id'], 'product_revision' => $plan['preview']['product_revision'],
                'weight' => $weights[$index], 'reference_base' => $item['price_snapshot']['amount'], 'allocated_base' => $allocated, 'extra_price' => $extra];
        }
        abort_if($expectations && bccomp($price, $line['expected_unit_price'], 4) !== 0, 409, 'El precio del combo cambió. Revisa sus componentes y adicionales.');
        $subtotal = Money::bounded(bcmul($price, (string) $line['quantity'], 4));
        $header = ['product_id' => $root->id, 'product_name' => $root->name, 'sku' => $root->sku, 'quantity' => $line['quantity'], 'unit_price' => $price, 'line_subtotal' => $subtotal, 'notes' => $line['notes'] ?? null,
            'snapshot' => ['version' => 1, 'product_revision' => $root->revision, 'allocation_mode' => $root->combo_allocation_mode, 'base_unit_price' => $base, 'price_context' => $rootPlan['item']['price_snapshot'], 'availability_context' => $rootPlan['item']['availability_snapshot'], 'components' => $composition]];

        return ['header' => $header, 'items' => $items, 'preview' => [...$rootPlan['preview'], 'kind' => 'combo', 'expected_unit_price' => $price, 'components' => $previews, 'allocation_mode' => $root->combo_allocation_mode]];
    }
}
