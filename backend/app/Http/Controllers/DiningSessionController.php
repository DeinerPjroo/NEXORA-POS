<?php

namespace App\Http\Controllers;

use App\Domains\Dining\DiningOccupancy;
use App\Http\Requests\DiningCloseRequest;
use App\Http\Requests\DiningSessionFiltersRequest;
use App\Http\Requests\DiningSessionRequest;
use App\Http\Requests\DiningTransferRequest;
use App\Http\Resources\DiningSessionResource;
use App\Http\Resources\OrderResource;
use App\Models\DiningRoom;
use App\Models\DiningSession;
use App\Models\DiningSessionTable;
use App\Models\DiningTable;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

final class DiningSessionController extends Controller
{
    public function index(DiningSessionFiltersRequest $request)
    {
        $d = $request->validated();

        return DiningSessionResource::collection(DiningSession::with(['waiter', 'memberships' => fn ($q) => $q->whereNull('released_at')->with('table')])->withCount('orders')
            ->when($d['branch_id'] ?? null, fn ($q, $id) => $q->where('branch_id', $id))
            ->when($d['status'] ?? null, fn ($q, $s) => $q->where('status', $s))->latest('id')->paginate($d['per_page'] ?? 20));
    }

    public function show(Request $request, DiningSession $diningSession)
    {
        Gate::authorize('dining.view');

        return $this->detail($request, $diningSession);
    }

    public function store(DiningSessionRequest $request, DiningOccupancy $service)
    {
        return $this->detail($request, $service->save($request->user(), $request->validated()))->response()->setStatusCode(201);
    }

    public function orders(Request $request, DiningSession $diningSession)
    {
        Gate::authorize('dining.view');
        Gate::authorize('orders.view');
        $data = $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,30']]);

        return OrderResource::collection($diningSession->orders()->with('branch', 'items', 'sale')->latest('id')->paginate($data['per_page'] ?? 20));
    }

    public function update(DiningSessionRequest $request, DiningSession $diningSession, DiningOccupancy $service)
    {
        return $this->detail($request, $service->save($request->user(), $request->validated(), $diningSession));
    }

    public function close(DiningCloseRequest $request, DiningSession $diningSession, DiningOccupancy $service)
    {
        return $this->detail($request, $service->close($request->user(), $diningSession, $request->validated()));
    }

    public function transfer(DiningTransferRequest $request, Order $order, DiningOccupancy $service)
    {
        return new OrderResource($service->transfer($request->user(), $order, $request->validated())->load('branch', 'items', 'sale'));
    }

    public function occupancy(DiningRoom $diningRoom)
    {
        Gate::authorize('dining.view');
        $tables = $diningRoom->diningTables()->where('is_active', true)->orderBy('id')->get();
        $members = DiningSessionTable::whereIn('dining_table_id', $tables->pluck('id'))->whereNull('released_at')->with('session.waiter')->get()->keyBy('dining_table_id');

        return ['data' => $tables->map(function ($table) use ($members) {
            $session = $members->get($table->id)?->session;

            return ['table' => $table->only(['id', 'name', 'shape', 'color', 'capacity', 'revision']), 'session' => $session ? ['id' => $session->id, 'revision' => $session->revision, 'guest_count' => $session->guest_count, 'waiter_name' => $session->waiter?->name, 'opened_at' => $session->opened_at] : null];
        })];
    }

    public function availableTables(Request $request)
    {
        Gate::authorize('dining.operate');
        $d = $request->validate(['branch_id' => ['required', 'integer'], 'session_id' => ['nullable', 'integer'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $occupied = DiningSessionTable::whereNull('released_at')->when($d['session_id'] ?? null, fn ($q, $id) => $q->where('dining_session_id', '!=', $id))->select('dining_table_id');

        return JsonResource::collection(DiningTable::where('branch_id', $d['branch_id'])->where('is_active', true)->whereHas('room', fn ($q) => $q->where('is_active', true))->whereNotIn('id', $occupied)->with('room:id,name')->orderBy('name')->orderBy('id')->paginate(50)->through(fn ($t) => [...$t->only(['id', 'name', 'revision', 'capacity']), 'room_name' => $t->room->name]));
    }

    public function waiters(Request $request)
    {
        Gate::authorize('dining.operate');
        $d = $request->validate(['search' => ['nullable', 'string', 'max:80'], 'page' => ['sometimes', 'integer', 'min:1']]);

        return JsonResource::collection(User::where('tenant_id', $request->user()->tenant_id)->where('is_active', true)->whereHas('role.permissions', fn ($q) => $q->where('key', 'dining.operate'))
            ->when($d['search'] ?? null, fn ($q, $s) => $q->where('name', 'like', '%'.$s.'%'))->orderBy('name')->orderBy('id')->paginate(50, ['id', 'name']));
    }

    private function detail(Request $request, DiningSession $session): DiningSessionResource
    {
        $session->load(['waiter', 'memberships' => fn ($q) => $q->with('table')->orderBy('id'), 'events' => fn ($q) => $q->latest('id')->limit(50)])->loadCount('orders');
        if ($request->user()->can('orders.view')) {
            $session->load(['orders' => fn ($q) => $q->with('sale')->latest('id')->limit(100)]);
        }

        return new DiningSessionResource($session);
    }
}
