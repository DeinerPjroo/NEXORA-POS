<?php

namespace App\Domains\Kitchen;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Branch;
use App\Models\KitchenDispatch;
use App\Models\KitchenRoute;
use App\Models\KitchenStation;
use App\Models\KitchenTicket;
use App\Models\KitchenTicketEvent;
use App\Models\KitchenTicketLine;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class KitchenWorkflow
{
    public function route(User $actor, array $data): KitchenRoute
    {
        Gate::authorize('kitchen.manage');
        Gate::authorize('catalog.view');

        return app(IdempotentOperation::class)->run($actor, 'kitchen.route.save', $data, KitchenRoute::class, function ($data) use ($actor) {
            $product = Product::whereKey($data['product_id'])->lockForUpdate()->firstOrFail();
            abort_unless($product->revision === (int) $data['product_revision'], 409, 'El producto cambió. Vuelve a seleccionarlo.');
            abort_unless($product->kind === 'regular', 422, 'Asigna los componentes individuales del combo a sus estaciones.');
            $station = KitchenStation::whereKey($data['kitchen_station_id'])->where('branch_id', $data['branch_id'])->firstOrFail();
            abort_unless($station->is_active, 409, 'La estación está archivada.');
            $route = KitchenRoute::firstOrNew(['branch_id' => $station->branch_id, 'product_id' => $product->id]);
            $route->kitchen_station_id = $station->id;
            $route->is_active = $data['is_active'];
            $route->revision = $route->exists ? $route->revision + 1 : 1;
            $route->save();
            $product->revision++;
            $product->save();
            Audit::record('kitchen.route.saved', 'Se configuró una ruta de preparación.', $actor, ['route_id' => $route->id, 'product_id' => $product->id, 'station_id' => $station->id]);

            return $route;
        });
    }

    public function pending(Order $order)
    {
        $sent = KitchenTicketLine::where('order_id', $order->id)->pluck('order_item_id');
        $items = $order->items()->whereNotIn('id', $sent)->with('preparationCorrections')->orderBy('id')->get();
        $routes = KitchenRoute::where('branch_id', $order->branch_id)->whereIn('product_id', $items->pluck('product_id'))->where('is_active', true)->with('station')->get()->keyBy('product_id');

        return $items->map(fn ($item) => ['item' => $item, 'station' => ($routes->get($item->product_id)?->station?->is_active ? $routes->get($item->product_id)->station : null)]);
    }

    public function dispatch(User $actor, Order $order, array $data): KitchenDispatch
    {
        Gate::authorize('orders.manage');
        Gate::authorize('orders.view');

        return app(IdempotentOperation::class)->run($actor, 'kitchen.dispatch.'.$order->id, $data, KitchenDispatch::class, function ($data) use ($actor, $order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            abort_unless($order->revision === (int) $data['order_revision'], 409, 'El pedido cambió. Revisa el envío.');
            abort_if(in_array($order->status, ['cancelled', 'delivered'], true), 409, 'El pedido está cancelado o entregado.');
            abort_unless(Branch::whereKey($order->branch_id)->where('is_active', true)->exists(), 409, 'La sucursal está inactiva.');
            $pending = $this->pending($order);
            abort_if($pending->isEmpty(), 409, 'Todos los productos del pedido ya se enviaron a cocina.');
            $missing = $pending->filter(fn ($row) => ! $row['station'])->map(fn ($row) => $row['item']->product_name);
            abort_if($missing->isNotEmpty(), 422, 'Configura una estación activa para: '.$missing->implode(', '));
            $dispatch = KitchenDispatch::create(['order_id' => $order->id, 'branch_id' => $order->branch_id, 'created_by' => $actor->id]);
            foreach ($pending->groupBy(fn ($row) => $row['station']->id) as $rows) {
                $station = $rows->first()['station'];
                $ticket = KitchenTicket::create(['branch_id' => $order->branch_id, 'order_id' => $order->id, 'kitchen_dispatch_id' => $dispatch->id, 'kitchen_station_id' => $station->id, 'station_name' => $station->name, 'station_color' => $station->color, 'target_minutes' => $station->target_minutes, 'order_snapshot' => ['channel' => $order->channel, 'customer_name' => $order->customer_name, 'reference' => $order->reference, 'notes' => $order->notes, 'dining' => $order->dining_snapshot], 'status' => 'new', 'revision' => 1]);
                foreach ($rows as $row) {
                    $item = $row['item'];
                    $snapshot = [...$item->only('product_name', 'variant_name', 'quantity', 'notes', 'order_combo_id'), 'preparation_destination' => $item->destination($order->channel)];
                    $snapshot['preparations'] = collect($item->modifiers_snapshot ?? [])->map(fn ($group) => ['name' => $group['group_name'], 'options' => collect($group['options'])->pluck('name')->values()->all()])->all();
                    KitchenTicketLine::create(['order_id' => $order->id, 'kitchen_ticket_id' => $ticket->id, 'order_item_id' => $item->id, 'snapshot' => $snapshot]);
                }
                $this->event($actor, $ticket, null, 'new');
            }
            $this->synchronize($actor, $order);
            Audit::record('kitchen.dispatched', 'Se enviaron nuevas líneas del pedido a cocina.', $actor, ['order_id' => $order->id, 'dispatch_id' => $dispatch->id]);

            return $dispatch;
        });
    }

    public function transition(User $actor, KitchenTicket $ticket, array $data): KitchenTicket
    {
        Gate::authorize('kitchen.operate');
        Gate::authorize('kitchen.view');

        return app(IdempotentOperation::class)->run($actor, 'kitchen.ticket.state.'.$ticket->id, $data, KitchenTicket::class, function ($data) use ($actor, $ticket) {
            $ticket = KitchenTicket::whereKey($ticket->id)->lockForUpdate()->firstOrFail();
            $order = Order::whereKey($ticket->order_id)->lockForUpdate()->firstOrFail();
            abort_if($order->status === 'cancelled', 409, 'El pedido está cancelado.');
            abort_unless($ticket->revision === (int) $data['revision'], 409, 'La comanda cambió. Actualiza cocina.');
            $next = ['new' => 'preparing', 'preparing' => 'ready', 'ready' => 'delivered'];
            abort_unless(($next[$ticket->status] ?? null) === $data['status'], 409, 'No se permite ese cambio de estado.');
            $from = $ticket->status;
            $ticket->status = $data['status'];
            $ticket->revision++;
            $field = ['preparing' => 'started_at', 'ready' => 'ready_at', 'delivered' => 'delivered_at'][$data['status']];
            $ticket->$field = now();
            $ticket->save();
            $this->event($actor, $ticket, $from, $ticket->status);
            $this->synchronize($actor, $order);
            Audit::record('kitchen.ticket.status', 'Se actualizó una comanda de cocina.', $actor, ['ticket_id' => $ticket->id, 'status' => $ticket->status]);

            return $ticket;
        });
    }

    private function synchronize(User $actor, Order $order): void
    {
        $tickets = KitchenTicket::where('order_id', $order->id)->where('status', '!=', 'cancelled')->get();
        if ($tickets->isEmpty() || $order->status === 'cancelled') {
            return;
        }
        $unsent = $order->items()->whereNotIn('id', KitchenTicketLine::where('order_id', $order->id)->select('order_item_id'))->exists();
        $status = ! $unsent && $tickets->every(fn ($t) => $t->status === 'delivered') ? 'delivered' : (! $unsent && $tickets->every(fn ($t) => in_array($t->status, ['ready', 'delivered'], true)) ? 'ready' : 'preparing');
        if ($order->status === $status) {
            return;
        }
        $from = $order->status;
        $order->status = $status;
        $order->revision++;
        $order->save();
        OrderEvent::create(['order_id' => $order->id, 'actor_id' => $actor->id, 'from_status' => $from, 'to_status' => $status, 'reason' => 'Actualización de comandas de cocina.', 'created_at' => now()]);
        Audit::record('order.kitchen.synchronized', 'Se sincronizó el estado de preparación.', $actor, ['order_id' => $order->id, 'status' => $status]);
    }

    // Called inside the authorized delivery transaction under Tenant/Order locks.
    public function handOffForDelivery(User $actor, Order $order): void
    {
        foreach (KitchenTicket::where('order_id', $order->id)->where('status', 'ready')->lockForUpdate()->get() as $ticket) {
            $ticket->status = 'delivered';
            $ticket->delivered_at = now();
            $ticket->revision++;
            $ticket->save();
            $this->event($actor, $ticket, 'ready', 'delivered', 'Entregada al repartidor del domicilio.');
        }
        $this->synchronize($actor, $order);
    }

    public function cancel(User $actor, Order $order, ?string $reason): void
    {
        foreach (KitchenTicket::where('order_id', $order->id)->whereNotIn('status', ['cancelled', 'delivered'])->lockForUpdate()->get() as $ticket) {
            $from = $ticket->status;
            $ticket->status = 'cancelled';
            $ticket->revision++;
            $ticket->save();
            $this->event($actor, $ticket, $from, 'cancelled', $reason);
        }
    }

    private function event(User $actor, KitchenTicket $ticket, ?string $from, string $to, ?string $reason = null): void
    {
        KitchenTicketEvent::create(['order_id' => $ticket->order_id, 'kitchen_ticket_id' => $ticket->id, 'actor_id' => $actor->id, 'from_status' => $from, 'to_status' => $to, 'reason' => $reason, 'created_at' => now()]);
    }
}
