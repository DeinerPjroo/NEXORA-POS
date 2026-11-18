<?php

namespace App\Domains\Orders;

use App\Domains\Operations\Money;
use App\Models\Branch;
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
        $company = $actor->tenant()->firstOrFail();
        abort_if($company->currency !== $data['currency'], 409, 'La moneda cambió. Revisa el catálogo antes de registrar el pedido.');
        $catalog = new OrderCatalog($data['items'], $branch, $data['channel'], $company->timezone);
        $items = [];
        $combos = [];
        $preview = [];
        $subtotal = '0.0000';
        foreach ($data['items'] as $line) {
            $product = $catalog->products->get($line['product_id']);
            abort_unless($product, 409, 'Un producto ya no está disponible. Revisa el catálogo.');
            if ($product->kind === 'combo') {
                $plan = app(OrderComboPlan::class)->build($catalog, $product, $line, $expectations);
                $index = count($combos);
                $combos[] = $plan['header'];
                foreach ($plan['items'] as $item) {
                    $items[] = [...$item, '_combo_index' => $index];
                }
                $preview[] = $plan['preview'];
            } else {
                abort_if(($line['kind'] ?? 'regular') !== 'regular' || array_key_exists('components', $line) || array_key_exists('selection_version', $line), 422, 'Un producto individual no recibe composición de combo.');
                $plan = $catalog->resolve($product, $line['variant_id'] ?? null, $line, $expectations);
                $items[] = $plan['item'];
                $preview[] = $plan['preview'];
            }
            abort_if(count($items) > 100, 422, 'El pedido supera 100 posiciones facturables al expandir sus combos.');
        }
        foreach ($items as $item) {
            $subtotal = Money::bounded(bcadd($subtotal, $item['line_subtotal'], 4));
        }

        return ['branch' => $branch, 'subtotal' => $subtotal, 'items' => $items, 'combos' => $combos, 'preview_items' => $preview];
    }
}
