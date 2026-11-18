<?php

namespace App\Domains\Orders;

use App\Domains\Catalog\AvailabilitySchedule;
use App\Domains\Catalog\CatalogPriceResolver;
use App\Domains\Operations\Money;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductComboComponent;
use App\Models\ProductComboGroup;
use App\Models\ProductVariant;
use Illuminate\Support\Collection;

final class OrderCatalog
{
    public Collection $products;

    public Collection $components;

    public Collection $groups;

    private Collection $variants;

    private Collection $prices;

    // El llamante mantiene el bloqueo Tenant durante todo el plan.
    public function __construct(array $lines, private Branch $branch, private string $channel, string $timezone)
    {
        $ids = collect($lines)->pluck('product_id')->unique();
        $this->components = ProductComboComponent::whereIn('product_id', $ids)->enabledComposition()->orderBy('position')->orderBy('id')->get();
        $this->groups = ProductComboGroup::whereIn('product_id', $ids)->where('is_active', true)->orderBy('position')->orderBy('id')->get();
        $kinds = Product::whereIn('id', $ids)->pluck('kind', 'id');
        $positions = 0;
        $selected = collect();
        foreach ($lines as $line) {
            $parts = ($kinds[$line['product_id']] ?? null) === 'combo' ? ComboSelection::components((int) $line['product_id'], $this->components, $this->groups, $line) : collect();
            $positions += ($kinds[$line['product_id']] ?? null) === 'combo' ? $parts->sum('units') : 1;
            $selected = $selected->concat($parts);
            abort_if($positions > 100, 422, 'El pedido supera 100 posiciones facturables al expandir sus combos.');
        }
        $selected = $selected->unique('id');
        $ids = $ids->merge($selected->pluck('component_product_id'))->unique()->sort()->values();
        $this->products = Product::with(['taxProfile', 'modifierGroups' => fn ($q) => $q->where('is_active', true), 'modifierGroups.options' => fn ($q) => $q->where('is_active', true)])->withCatalogCounts()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $categories = Category::with('parent')->whereIn('id', $this->products->pluck('category_id')->unique())->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        foreach ($this->products as $product) {
            $product->setRelation('category', $categories->get($product->category_id));
        }
        app(AvailabilitySchedule::class)->decorate($this->products, $timezone);
        $variantIds = collect($lines)->pluck('variant_id')->merge($selected->pluck('component_variant_id'))->filter()->unique()->values()->all();
        $this->variants = ProductVariant::whereIn('id', $variantIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $this->prices = app(CatalogPriceResolver::class)->candidates($ids->all(), $variantIds, $branch->id, $channel);
    }

    public function resolve(Product $product, ?int $variantId, array $line, bool $expectations, bool $comparePrice = true, bool $extrasOnly = false): array
    {
        abort_unless($product->is_active && $product->is_available && $product->category?->isEffectivelyActive(), 409, 'Un producto ya no está disponible. Revisa el catálogo.');
        $availability = $product->getAttribute('availability_context');
        abort_unless($availability['allowed'], 409, 'Un producto está fuera del horario de disponibilidad ('.$availability['timezone'].'). Revisa el carrito.');
        abort_if($expectations && $product->revision !== (int) $line['product_revision'], 409, 'El catálogo cambió. Revisa los productos y precios antes de enviar.');
        $profile = $product->taxProfile;
        abort_if($profile && (! $profile->is_active || ($expectations && $profile->revision !== (int) ($line['expected_tax_revision'] ?? 0))), 409, 'El perfil de impuestos del producto cambió. Revisa el catálogo.');
        $variant = $variantId ? $this->variants->get($variantId) : null;
        if ($product->variants_count > 0) {
            abort_unless($variant && (int) $variant->product_id === $product->id && $variant->is_active && $variant->is_available, 409, 'Selecciona una variante disponible del producto.');
        } else {
            abort_if($variantId !== null, 409, 'La variante no corresponde al producto.');
        }
        $context = app(CatalogPriceResolver::class)->resolve($product, $variant, $this->branch, $this->channel, $this->prices);
        $modifiers = app(OrderModifiers::class)->resolve($product, $extrasOnly ? '0.0000' : $context['amount'], $line['modifiers'] ?? []);
        $price = $modifiers['unit_price'];
        abort_if($expectations && $comparePrice && bccomp($price, $line['expected_unit_price'], 4) !== 0, 409, 'El precio cambió. Revisa el catálogo antes de enviar.');
        $tax = $profile?->snapshot() ?? ['profile_id' => null, 'name' => null, 'price_mode' => 'none', 'rates' => [], 'revision' => null];
        $item = ['product_id' => $product->id, 'variant_id' => $variant?->id, 'product_name' => $product->name, 'variant_name' => $variant?->name,
            'sku' => $variant?->sku ?? $product->sku, 'quantity' => (int) $line['quantity'], 'unit_price' => $price, 'line_subtotal' => Money::bounded(bcmul($price, (string) $line['quantity'], 4)), 'notes' => $line['notes'] ?? null,
            'base_unit_price' => $modifiers['base_unit_price'], 'modifiers_snapshot' => $modifiers['snapshot'], 'tax_snapshot' => $tax, 'price_snapshot' => $context, 'availability_snapshot' => $availability];
        $preview = ['product_id' => $product->id, 'variant_id' => $variant?->id, 'product_name' => $product->name, 'variant_name' => $variant?->name,
            'quantity' => (int) $line['quantity'], 'product_revision' => $product->revision, 'expected_tax_revision' => $profile?->revision, 'expected_unit_price' => $price,
            'base_unit_price' => $modifiers['base_unit_price'], 'modifiers' => array_map(fn ($group) => ['group_id' => $group['group_id'], 'option_ids' => array_column($group['options'], 'id')], $modifiers['snapshot']),
            'modifier_labels' => $modifiers['snapshot'], 'tax_snapshot' => $tax, 'price_context' => $context, 'availability_context' => $availability, 'notes' => $line['notes'] ?? ''];

        return ['item' => $item, 'preview' => $preview];
    }
}
