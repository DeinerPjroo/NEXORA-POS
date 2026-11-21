<?php

namespace App\Http\Controllers;

use App\Domains\Kitchen\KitchenWorkflow;
use App\Http\Resources\KitchenTicketResource;
use App\Models\DiningSession;
use App\Models\KitchenRoute;
use App\Models\KitchenTicket;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

final class KitchenController extends Controller
{
    public function orderTickets(Request $request, Order $order)
    {
        Gate::authorize('orders.view');
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);

        return KitchenTicketResource::collection(KitchenTicket::where('order_id', $order->id)->with('lines', 'events')->latest('id')->paginate(30));
    }

    public function sessionTickets(Request $request, DiningSession $diningSession)
    {
        Gate::authorize('dining.view');
        Gate::authorize('orders.view');
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);

        return KitchenTicketResource::collection(KitchenTicket::whereIn('order_id', Order::where('dining_session_id', $diningSession->id)->select('id'))->with('lines', 'events')->latest('id')->paginate(30))->additional(['server_now' => now()->toISOString()]);
    }

    private function own(Request $request, string $table)
    {
        return Rule::exists($table, 'id')->where('tenant_id', $request->user()->tenant_id);
    }

    public function routes(Request $request)
    {
        Gate::authorize('kitchen.manage');
        Gate::authorize('catalog.view');
        $data = $request->validate(['branch_id' => ['required', 'integer', $this->own($request, 'branches')], 'page' => ['sometimes', 'integer', 'min:1']]);

        return JsonResource::collection(KitchenRoute::where('branch_id', $data['branch_id'])->with('product:id,name,revision', 'station:id,name')->orderBy('id')->paginate(30)->through(fn ($r) => [...$r->only('id', 'branch_id', 'product_id', 'kitchen_station_id', 'is_active', 'revision'), 'product' => $r->product->only('id', 'name', 'revision'), 'station' => $r->station->only('id', 'name')]));
    }

    public function saveRoute(Request $request, KitchenWorkflow $service)
    {
        Gate::authorize('kitchen.manage');
        Gate::authorize('catalog.view');
        $data = $request->validate(['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'branch_id' => ['required', 'integer', $this->own($request, 'branches')], 'product_id' => ['required', 'integer', $this->own($request, 'products')], 'product_revision' => ['required', 'integer', 'min:1'], 'kitchen_station_id' => ['required', 'integer', $this->own($request, 'kitchen_stations')], 'is_active' => ['required', 'boolean']]);

        return response()->json(['data' => $service->route($request->user(), $data)->only('id', 'revision')]);
    }

    public function preview(Order $order, KitchenWorkflow $service)
    {
        Gate::authorize('orders.view');
        Gate::authorize('orders.manage');

        return ['data' => ['order_id' => $order->id, 'order_revision' => $order->revision, 'status' => $order->status, 'lines' => $service->pending($order)->map(fn ($row) => ['id' => $row['item']->id, 'name' => $row['item']->product_name, 'quantity' => $row['item']->quantity, 'preparation_destination' => $row['item']->destination($order->channel), 'station' => $row['station']?->only('id', 'name')])]];
    }

    public function dispatch(Request $request, Order $order, KitchenWorkflow $service)
    {
        Gate::authorize('orders.view');
        Gate::authorize('orders.manage');
        $data = $request->validate(['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'order_revision' => ['required', 'integer', 'min:1']]);
        $dispatch = $service->dispatch($request->user(), $order, $data);

        return response()->json(['data' => ['id' => $dispatch->id, 'order_id' => $dispatch->order_id, 'tickets' => KitchenTicketResource::collection($dispatch->tickets()->with('lines')->get())]], 201);
    }

    public function index(Request $request)
    {
        Gate::authorize('kitchen.view');
        $data = $request->validate(['branch_id' => ['required', 'integer', $this->own($request, 'branches')], 'station_id' => ['nullable', 'integer', $this->own($request, 'kitchen_stations')], 'history' => ['sometimes', 'boolean'], 'page' => ['sometimes', 'integer', 'min:1']]);

        return KitchenTicketResource::collection(KitchenTicket::where('branch_id', $data['branch_id'])->when($data['station_id'] ?? null, fn ($q, $id) => $q->where('kitchen_station_id', $id))->whereIn('status', ($data['history'] ?? false) ? ['delivered', 'cancelled'] : ['new', 'preparing', 'ready'])->with('lines', 'events')->orderByDesc('id')->paginate(60))->additional(['server_now' => now()->toISOString()]);
    }

    public function transition(Request $request, KitchenTicket $kitchenTicket, KitchenWorkflow $service)
    {
        Gate::authorize('kitchen.operate');
        Gate::authorize('kitchen.view');
        $data = $request->validate(['tenant_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'], 'status' => ['required', Rule::in(['preparing', 'ready', 'delivered'])]]);

        return new KitchenTicketResource($service->transition($request->user(), $kitchenTicket, $data)->load('lines', 'events'));
    }
}
