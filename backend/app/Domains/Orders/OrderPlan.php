<?php

namespace App\Domains\Orders;

use App\Domains\Catalog\CatalogPriceResolver;
use App\Domains\Operations\Money;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class OrderPlan
{
    // Ejecutar bajo bloqueo Tenant: comando idempotente o preview transaccional.
    public function build(User $actor, array $data, bool $expectations = true): array
    {
        Gate::authorize('orders.manage');
        Gate::authorize('catalog.view');
        $branch = Branch::whereKey($data['branch_id'])->lockForUpdate()->firstOrFail();
        abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
        abort_if($actor->tenant()->value('currency') !== $data['currency'], 409, 'La moneda cambió. Revisa el catálogo antes de registrar el pedido.');
        $ids = collect($data['items'])->pluck('product_id')->unique()->sort()->values();
        $variantIds = collect($data['items'])->pluck('variant_id')->filter()->unique()->values()->all();
        $categoryIds = Product::whereIn('id', $ids)->pluck('category_id')->unique()->sort();
        $categories = Category::with('parent')->whereIn('id', $categoryIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $products = Product::with(['taxProfile', 'modifierGroups' => fn ($q) => $q->where('is_active', true), 'modifierGroups.options' => fn ($q) => $q->where('is_active', true)])->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $resolver = app(CatalogPriceResolver::class);
        $candidates = $resolver->candidates($ids->all(), $variantIds, $branch->id, $data['channel']);
        $items = [];
        $preview = [];
        $subtotal = '0.0000';
        foreach ($data['items'] as $line) {
            $product = $products->get($line['product_id']);
            abort_unless($product && $product->is_active && $product->is_available && $categories->get($product->category_id)?->isEffectivelyActive(), 409, 'Un producto ya no está disponible. Revisa el catálogo.');
            abort_if($expectations && $product->revision !== (int) $line['product_revision'], 409, 'El catálogo cambió. Revisa los productos y precios antes de enviar.');
            $profile = $product->taxProfile;
            abort_if($profile && (! $profile->is_active || ($expectations && $profile->revision !== (int) ($line['expected_tax_revision'] ?? 0))), 409, 'El perfil de impuestos del producto cambió. Revisa el catálogo.');
            $variant = null;
            if ($product->variants()->exists()) {
                $variant = $product->variants()->whereKey($line['variant_id'] ?? 0)->lockForUpdate()->first();
                abort_unless($variant && $variant->is_active && $variant->is_available, 409, 'Selecciona una variante disponible del producto.');
            } else {
                abort_if(isset($line['variant_id']), 409, 'La variante no corresponde al producto.');
            }
            $contextPrice = $resolver->resolve($product, $variant, $branch, $data['channel'], $candidates);
            $modifiers = app(OrderModifiers::class)->resolve($product, $contextPrice['amount'], $line['modifiers'] ?? []);
            $price = $modifiers['unit_price'];
            abort_if($expectations && bccomp($price, $line['expected_unit_price'], 4) !== 0, 409, 'El precio cambió. Revisa el catálogo antes de enviar.');
            $lineSubtotal = Money::bounded(bcmul($price, (string) $line['quantity'], 4));
            $subtotal = Money::bounded(bcadd($subtotal, $lineSubtotal, 4));
            $taxSnapshot = $profile?->snapshot() ?? ['profile_id' => null, 'name' => null, 'price_mode' => 'none', 'rates' => [], 'revision' => null];
            $item = ['product_id' => $product->id, 'variant_id' => $variant?->id, 'product_name' => $product->name, 'variant_name' => $variant?->name,
                'sku' => $variant?->sku ?? $product->sku, 'quantity' => (int) $line['quantity'], 'unit_price' => $price, 'line_subtotal' => $lineSubtotal, 'notes' => $line['notes'] ?? null,
                'base_unit_price' => $modifiers['base_unit_price'], 'modifiers_snapshot' => $modifiers['snapshot'], 'tax_snapshot' => $taxSnapshot, 'price_snapshot' => $contextPrice];
            $items[] = $item;
            $preview[] = ['product_id' => $product->id, 'variant_id' => $variant?->id, 'product_name' => $product->name, 'variant_name' => $variant?->name,
                'quantity' => (int) $line['quantity'], 'product_revision' => $product->revision, 'expected_tax_revision' => $profile?->revision, 'expected_unit_price' => $price,
                'base_unit_price' => $modifiers['base_unit_price'], 'modifiers' => array_map(fn ($group) => ['group_id' => $group['group_id'], 'option_ids' => array_column($group['options'], 'id')], $modifiers['snapshot']),
                'modifier_labels' => $modifiers['snapshot'], 'tax_snapshot' => $taxSnapshot, 'price_context' => $contextPrice, 'notes' => $line['notes'] ?? ''];
        }

        return ['branch' => $branch, 'subtotal' => $subtotal, 'items' => $items, 'preview_items' => $preview];
    }
}
