<?php

namespace App\Http\Controllers;

use App\Domains\Orders\DeliveryWorkflow;
use App\Http\Requests\DeliveryStateRequest;
use App\Models\Branch;
use App\Models\OrderDelivery;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DeliveryController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->can('orders.view') && ($request->user()->can('orders.manage') || $request->user()->can('deliveries.operate')), 403);
        $d = $request->validate(['branch_id' => ['required', 'integer'], 'page' => ['sometimes', 'integer', 'min:1'], 'status' => ['nullable', 'in:pending,assigned,out_for_delivery,delivered,cancelled']]);
        Branch::findOrFail($d['branch_id']);

        return JsonResource::collection(OrderDelivery::where('branch_id', $d['branch_id'])->when(! $request->user()->can('orders.manage'), fn ($q) => $q->where('courier_id', $request->user()->id))->when($d['status'] ?? null, fn ($q, $s) => $q->where('status', $s))->with('order', 'courier', 'events')->latest('id')->paginate(20)->through(fn ($row) => $this->present($row)));
    }

    public function couriers(Request $request)
    {
        abort_unless($request->user()->can('orders.manage'), 403);
        $d = $request->validate(['branch_id' => ['required', 'integer']]);
        Branch::findOrFail($d['branch_id']);

        return ['data' => User::where('tenant_id', $request->user()->tenant_id)->where('is_active', true)->whereHas('role.permissions', fn ($q) => $q->where('key', 'deliveries.operate'))->get()->filter(fn ($u) => $u->canAccessBranch($d['branch_id']))->map(fn ($u) => $u->only('id', 'name'))->values()];
    }

    public function change(DeliveryStateRequest $request, OrderDelivery $orderDelivery, DeliveryWorkflow $service)
    {
        return ['data' => $this->present($service->change($request->user(), $orderDelivery, $request->validated())->load('order', 'courier', 'events'))];
    }

    public function present(OrderDelivery $d): array
    {
        return [...$d->only('id', 'order_id', 'branch_id', 'recipient_name', 'phone', 'address', 'instructions', 'courier_id', 'status', 'revision', 'out_at', 'delivered_at', 'created_at'), 'courier_name' => $d->courier?->name, 'preparation_status' => $d->order->status, 'events' => $d->events->map(fn ($e) => $e->only('id','status','reason','created_at'))];
    }
}
