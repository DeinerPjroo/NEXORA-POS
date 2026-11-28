<?php

namespace App\Http\Controllers;

use App\Domains\Orders\CourierCollections;
use App\Domains\Orders\TransferCourierCash;
use App\Domains\Sales\CollectCash;
use App\Domains\Sales\PartialRefund;
use App\Domains\Sales\SaleBalance;
use App\Http\Requests\CourierCollectionRequest;
use App\Http\Requests\CourierRefundRequest;
use App\Http\Requests\CourierSettlementRequest;
use App\Http\Resources\SaleResource;
use App\Models\Branch;
use App\Models\CourierCollection;
use App\Models\Order;
use App\Models\OrderDelivery;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CourierCollectionController extends Controller
{
    public function collect(CourierCollectionRequest $request, OrderDelivery $orderDelivery, CollectCash $service)
    {
        $order = Order::whereKey($orderDelivery->order_id)->firstOrFail();
        $sale = $service->execute($request->user(), $order, [...$request->validated(), 'discount_amount' => '0'], $orderDelivery->id);

        return (new SaleResource($sale->load('payments', 'refunds', 'accounts', 'order.items')))->response()->setStatusCode(201);
    }

    public function index(Request $request)
    {
        TransferCourierCash::authorize();
        $data = $request->validate(['branch_id' => ['required', 'integer'], 'page' => ['sometimes', 'integer', 'min:1']]);
        Branch::findOrFail($data['branch_id']);

        $page = CourierCollection::where('branch_id', $data['branch_id'])->with('payment', 'sale.payments', 'sale.refunds', 'courier', 'settlements', 'custodyRefunds')->latest('id')->paginate(20)->through(fn ($row) => [
            'id' => $row->id, 'order_id' => $row->order_id, 'sale_id' => $row->sale_id, 'payment_id' => $row->payment_id, 'courier_name' => $row->courier->name,
            'currency' => $row->sale->currency, 'amount' => $row->payment->amount, 'pending' => $row->pending(), 'revision' => $row->revision(),
            'sale_revision' => $row->sale->revision, 'refundable' => app(SaleBalance::class)->amounts($row->sale)['net_paid_amount'],
            'custody_refunds' => $row->custodyRefunds,
            'settlements' => $row->settlements, 'created_at' => $row->created_at,
        ]);

        return JsonResource::collection($page);
    }

    public function settle(CourierSettlementRequest $request, CourierCollection $courierCollection, CourierCollections $service)
    {
        return ['data' => $service->settle($request->user(), $courierCollection, $request->validated())];
    }

    public function refund(CourierRefundRequest $request, CourierCollection $courierCollection, PartialRefund $service)
    {
        $sale = $service->execute($request->user(), $courierCollection->sale, [...$request->validated(), 'refunds' => [['payment_id' => $courierCollection->payment_id, 'amount' => $request->validated('amount')]]], $courierCollection->id);

        return new SaleResource($sale->load('payments', 'refunds', 'accounts', 'order.items'));
    }
}
