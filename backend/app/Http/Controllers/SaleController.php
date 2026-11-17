<?php

namespace App\Http\Controllers;

use App\Domains\Sales\AddPayments;
use App\Domains\Sales\CollectCash;
use App\Domains\Sales\RefundCash;
use App\Domains\Sales\SaleTotals;
use App\Http\Requests\AddPaymentsRequest;
use App\Http\Requests\SaleCommandRequest;
use App\Http\Requests\SaleQueryRequest;
use App\Http\Resources\SaleResource;
use App\Models\CashSession;
use App\Models\Order;
use App\Models\Sale;
use App\Models\SalesSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

final class SaleController extends Controller
{
    public function index(SaleQueryRequest $request)
    {
        return SaleResource::collection(Sale::with('payments', 'refunds')->when($request->validated('branch_id'), fn ($q, $id) => $q->where('branch_id', $id))
            ->when($request->validated('status'), fn ($q, $status) => $q->where('status', $status))->latest('id')->paginate($request->validated('per_page', 20)));
    }

    public function show(Sale $sale)
    {
        Gate::authorize('sales.view');

        return new SaleResource($sale->load('payment', 'refund', 'payments', 'refunds', 'order.items'));
    }

    public function quote(SaleQueryRequest $request, Order $order, SaleTotals $totals)
    {
        return ['data' => [...$totals->calculate($order, SalesSetting::firstOrFail(), $request->validated('discount_amount', '0'), $request->validated()), 'order_revision' => $order->revision]];
    }

    public function cashContext(Request $request)
    {
        abort_unless($request->user()->hasPermission('sales.collect') || $request->user()->hasPermission('sales.refund'), 403);
        $data = $request->validate(['branch_id' => ['required', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $request->user()->tenant_id)]]);

        return ['data' => CashSession::with('register')->where('branch_id', $data['branch_id'])->where('status', 'open')->orderBy('id')->get()->filter(fn ($s) => $s->register->is_active && (int) $s->register->active_session_id === $s->id)->values()->map(fn ($s) => ['id' => $s->id, 'name' => $s->register->name, 'revision' => $s->revision, 'currency' => $s->currency])];
    }

    public function collect(SaleCommandRequest $request, Order $order, CollectCash $service)
    {
        return (new SaleResource($service->execute($request->user(), $order, $request->validated())->load('payment', 'refund', 'payments', 'refunds', 'order.items')))->response()->setStatusCode(201);
    }

    public function refund(SaleCommandRequest $request, Sale $sale, RefundCash $service)
    {
        return new SaleResource($service->execute($request->user(), $sale, $request->validated())->load('payment', 'refund', 'payments', 'refunds', 'order.items'));
    }

    public function addPayments(AddPaymentsRequest $request, Sale $sale, AddPayments $service)
    {
        return new SaleResource($service->execute($request->user(), $sale, $request->validated())->load('payment', 'refund', 'payments', 'refunds', 'order.items'));
    }
}
