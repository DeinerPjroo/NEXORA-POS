<?php

namespace App\Http\Controllers;

use App\Domains\Dining\SaveDiningRoom;
use App\Http\Requests\DiningFiltersRequest;
use App\Http\Requests\DiningLayoutRequest;
use App\Http\Requests\DiningRoomRequest;
use App\Http\Requests\DiningTableRequest;
use App\Http\Resources\DiningRoomResource;
use App\Http\Resources\DiningTableResource;
use App\Models\DiningRoom;
use App\Models\DiningTable;
use Illuminate\Support\Facades\Gate;

final class DiningController extends Controller
{
    public function index(DiningFiltersRequest $request)
    {
        $data = $request->validated();

        return DiningRoomResource::collection(DiningRoom::with('branch')
            ->when($data['branch_id'] ?? null, fn ($q, $id) => $q->where('branch_id', $id))
            ->when($data['search'] ?? null, fn ($q, $search) => $q->where('name', 'like', '%'.$search.'%'))
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'))
            ->orderBy('name')->orderBy('id')->paginate($data['per_page'] ?? 10));
    }

    public function show(DiningRoom $diningRoom)
    {
        Gate::authorize('dining.view');

        return $this->detail($diningRoom);
    }

    public function store(DiningRoomRequest $request, SaveDiningRoom $service)
    {
        return $this->detail($service->room($request->user(), $request->validated()))->response()->setStatusCode(201);
    }

    public function update(DiningRoomRequest $request, DiningRoom $diningRoom, SaveDiningRoom $service)
    {
        return $this->detail($service->room($request->user(), $request->validated(), $diningRoom));
    }

    public function tables(DiningFiltersRequest $request, DiningRoom $diningRoom)
    {
        $data = $request->validated();

        return DiningTableResource::collection($diningRoom->diningTables()
            ->when($data['search'] ?? null, fn ($q, $search) => $q->where('name', 'like', '%'.$search.'%'))
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'))
            ->orderBy('name')->orderBy('id')->paginate($data['per_page'] ?? 10));
    }

    public function storeTable(DiningTableRequest $request, DiningRoom $diningRoom, SaveDiningRoom $service)
    {
        return (new DiningTableResource($service->table($request->user(), $diningRoom, $request->validated())))->response()->setStatusCode(201);
    }

    public function updateTable(DiningTableRequest $request, DiningRoom $diningRoom, DiningTable $diningTable, SaveDiningRoom $service)
    {
        return new DiningTableResource($service->table($request->user(), $diningRoom, $request->validated(), $diningTable));
    }

    public function layout(DiningLayoutRequest $request, DiningRoom $diningRoom, SaveDiningRoom $service)
    {
        return $this->detail($service->layout($request->user(), $diningRoom, $request->validated()));
    }

    private function detail(DiningRoom $room): DiningRoomResource
    {
        return new DiningRoomResource($room->load(['branch', 'diningTables' => fn ($q) => $q->where('is_active', true)->orderBy('id')]));
    }
}
