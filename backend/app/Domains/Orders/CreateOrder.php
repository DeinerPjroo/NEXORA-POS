<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

final class CreateOrder
{
    public function execute(User $actor, array $data): Order
    {
        Gate::authorize('orders.manage');
        Gate::authorize('catalog.view');

        return app(IdempotentOperation::class)->run($actor, 'order.create', $data, Order::class, function ($data) use ($actor) {
            $branch = Branch::whereKey($data['branch_id'])->lockForUpdate()->firstOrFail();
            abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
            abort_if($actor->tenant()->value('currency') !== $data['currency'], 409, 'La moneda cambió. Revisa el catálogo antes de registrar el pedido.');
            $ids = collect($data['items'])->pluck('product_id')->unique()->sort()->values();
            $categoryIds = Product::whereIn('id', $ids)->pluck('category_id')->unique()->sort();
            $categories = Category::with('parent')->whereIn('id', $categoryIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $products = Product::with('taxProfile')->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $items = [];
            $subtotal = '0.0000';
            foreach ($data['items'] as $line) {
                $product = $products->get($line['product_id']);
                abort_unless($product && $product->is_active && $product->is_available && $categories->get($product->category_id)?->isEffectivelyActive(), 409, 'Un producto ya no está disponible. Revisa el catálogo.');
                abort_if($product->revision !== (int) $line['product_revision'], 409, 'El catálogo cambió. Revisa los productos y precios antes de enviar.');
                $profile = $product->taxProfile;
                abort_if($profile && (! $profile->is_active || $profile->revision !== (int) ($line['expected_tax_revision'] ?? 0)), 409, 'El perfil de impuestos del producto cambió. Revisa el catálogo.');
                $variant = null;
                if ($product->variants()->exists()) {
                    $variant = $product->variants()->whereKey($line['variant_id'] ?? 0)->lockForUpdate()->first();
                    abort_unless($variant && $variant->is_active && $variant->is_available, 409, 'Selecciona una variante disponible del producto.');
                } else {
                    abort_if(isset($line['variant_id']), 409, 'La variante no corresponde al producto.');
                }
                $price = $variant?->sale_price ?? $product->sale_price;
                abort_if(bccomp($price, $line['expected_unit_price'], 4) !== 0, 409, 'El precio cambió. Revisa el catálogo antes de enviar.');
                $lineSubtotal = Money::bounded(bcmul($price, (string) $line['quantity'], 4));
                $subtotal = Money::bounded(bcadd($subtotal, $lineSubtotal, 4));
                $items[] = ['product_id' => $product->id, 'variant_id' => $variant?->id, 'product_name' => $product->name, 'variant_name' => $variant?->name, 'sku' => $variant?->sku ?? $product->sku, 'quantity' => (int) $line['quantity'], 'unit_price' => $price, 'line_subtotal' => $lineSubtotal, 'notes' => $line['notes'] ?? null,
                    'tax_snapshot' => $profile?->snapshot() ?? ['profile_id' => null, 'name' => null, 'price_mode' => 'none', 'rates' => [], 'revision' => null]];
            }
            $order = Order::create(['public_id' => (string) Str::uuid(), 'branch_id' => $branch->id, 'created_by' => $actor->id, 'currency' => $data['currency'], 'channel' => $data['channel'], 'reference' => $data['reference'] ?? null, 'customer_name' => $data['customer_name'] ?? null, 'notes' => $data['notes'] ?? null, 'subtotal' => $subtotal, 'status' => 'open', 'revision' => 1]);
            $order->items()->createMany($items);
            OrderEvent::create(['order_id' => $order->id, 'actor_id' => $actor->id, 'from_status' => null, 'to_status' => 'open', 'created_at' => now()]);
            Audit::record('order.created', 'Se registró un pedido sin cobro.', $actor, ['order_id' => $order->id]);

            return $order;
        });
    }
}
