<?php

namespace App\Http\Controllers;

use App\Domains\Kitchen\CorrectPreparation;
use App\Domains\Orders\ChangeDeliveryItem;
use App\Domains\Orders\ChangeOrderState;
use App\Domains\Orders\CreateOrder;
use App\Domains\Orders\PreviewOrder;
use App\Domains\Orders\UpdateOrderCustomer;
use App\Http\Requests\OperationFiltersRequest;
use App\Http\Requests\OrderCustomerRequest;
use App\Http\Requests\OrderItemChangeRequest;
use App\Http\Requests\OrderPreviewRequest;
use App\Http\Requests\OrderRequest;
use App\Http\Requests\OrderStateRequest;
use App\Http\Requests\PreparationCorrectionRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\OrderDelivery;
use Illuminate\Support\Facades\Gate;

final class OrderController extends Controller
{
    public function changeItem(OrderItemChangeRequest $request, Order $order, ChangeDeliveryItem $service)
    {
        return new OrderResource($service->execute($request->user(), $order, $request->validated())->load('branch', 'items', 'events', 'sale', 'delivery'));
    }

    public function customer(Order $order)
    {
        Gate::authorize('orders.view');
        Gate::authorize('orders.manage');
        $delivery = $order->channel === 'delivery' ? OrderDelivery::where('order_id', $order->id)->firstOrFail() : null;

        return response()->json(['data' => ['revision' => $order->revision, 'customer_name' => $order->customer_name, 'reference' => $order->reference, 'delivery' => $delivery?->only('revision', 'recipient_name', 'phone', 'address', 'instructions', 'neighborhood', 'location_reference')]]);
    }

    public function updateCustomer(OrderCustomerRequest $request, Order $order, UpdateOrderCustomer $service)
    {
        return new OrderResource($service->execute($request->user(), $order, $request->validated())->load('branch', 'items', 'events', 'sale', 'delivery'));
    }

    public function correctPreparation(PreparationCorrectionRequest $request, Order $order, CorrectPreparation $service)
    {
        return new OrderResource($service->execute($request->user(), $order, $request->validated())->load('branch', 'items.preparationCorrections', 'events', 'sale', 'delivery'));
    }

    public function index(OperationFiltersRequest $request)
    {
        $query = Order::with('branch', 'sale', 'delivery')->withCount('items')
            ->when($request->validated('channel'), fn ($q, $channel) => $q->where('channel', $channel))
            ->when($request->validated('branch_id'), fn ($q, $id) => $q->where('branch_id', $id))
            ->when($request->validated('status'), fn ($q, $state) => $q->where('status', $state));

        return OrderResource::collection($query->latest('id')->paginate($request->validated('per_page', 20)));
    }

    public function show(Order $order)
    {
        Gate::authorize('orders.view');

        return new OrderResource($order->load('branch', 'items', 'events', 'sale', 'delivery'));
    }

    public function store(OrderRequest $request, CreateOrder $service)
    {
        return (new OrderResource($service->execute($request->user(), $request->validated())->load('branch', 'items', 'events', 'sale', 'delivery')))->response()->setStatusCode(201);
    }

    public function preview(OrderPreviewRequest $request, PreviewOrder $service)
    {
        return response()->json(['data' => $service->execute($request->user(), $request->validated())]);
    }

    public function changeState(OrderStateRequest $request, Order $order, ChangeOrderState $service)
    {
        return new OrderResource($service->execute($request->user(), $order, $request->validated())->load('branch', 'items', 'events', 'sale', 'delivery'));
    }
}
