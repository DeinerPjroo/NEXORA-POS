<?php

namespace App\Http\Controllers;

use App\Domains\Kitchen\CorrectPreparation;
use App\Domains\Orders\ChangeOrderState;
use App\Domains\Orders\CreateOrder;
use App\Domains\Orders\PreviewOrder;
use App\Http\Requests\OperationFiltersRequest;
use App\Http\Requests\OrderPreviewRequest;
use App\Http\Requests\OrderRequest;
use App\Http\Requests\OrderStateRequest;
use App\Http\Requests\PreparationCorrectionRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use Illuminate\Support\Facades\Gate;

final class OrderController extends Controller
{
    public function correctPreparation(PreparationCorrectionRequest $request, Order $order, CorrectPreparation $service)
    {
        return new OrderResource($service->execute($request->user(), $order, $request->validated())->load('branch', 'items.preparationCorrections', 'events', 'sale'));
    }

    public function index(OperationFiltersRequest $request)
    {
        $query = Order::with('branch', 'sale')->withCount('items')
            ->when($request->validated('channel'), fn ($q, $channel) => $q->where('channel', $channel))
            ->when($request->validated('branch_id'), fn ($q, $id) => $q->where('branch_id', $id))
            ->when($request->validated('status'), fn ($q, $state) => $q->where('status', $state));

        return OrderResource::collection($query->latest('id')->paginate($request->validated('per_page', 20)));
    }

    public function show(Order $order)
    {
        Gate::authorize('orders.view');

        return new OrderResource($order->load('branch', 'items', 'events', 'sale'));
    }

    public function store(OrderRequest $request, CreateOrder $service)
    {
        return (new OrderResource($service->execute($request->user(), $request->validated())->load('branch', 'items', 'events', 'sale')))->response()->setStatusCode(201);
    }

    public function preview(OrderPreviewRequest $request, PreviewOrder $service)
    {
        return response()->json(['data' => $service->execute($request->user(), $request->validated())]);
    }

    public function changeState(OrderStateRequest $request, Order $order, ChangeOrderState $service)
    {
        return new OrderResource($service->execute($request->user(), $order, $request->validated())->load('branch', 'items', 'events', 'sale'));
    }
}
