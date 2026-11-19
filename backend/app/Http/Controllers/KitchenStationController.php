<?php

namespace App\Http\Controllers;

use App\Domains\Kitchen\SaveKitchenStation;
use App\Http\Requests\KitchenFiltersRequest;
use App\Http\Requests\KitchenStationRequest;
use App\Http\Resources\KitchenStationResource;
use App\Models\KitchenStation;

final class KitchenStationController extends Controller
{
    public function index(KitchenFiltersRequest $request)
    {
        $data = $request->validated();

        return KitchenStationResource::collection(KitchenStation::with('branch')
            ->when($data['branch_id'] ?? null, fn ($q, $id) => $q->where('branch_id', $id))
            ->when($data['search'] ?? null, fn ($q, $search) => $q->where('name', 'like', '%'.$search.'%'))
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'))
            ->orderBy('name')->orderBy('id')->paginate($data['per_page'] ?? 12));
    }

    public function store(KitchenStationRequest $request, SaveKitchenStation $service)
    {
        return (new KitchenStationResource($service->execute($request->user(), $request->validated())->load('branch')))->response()->setStatusCode(201);
    }

    public function update(KitchenStationRequest $request, KitchenStation $kitchenStation, SaveKitchenStation $service)
    {
        return new KitchenStationResource($service->execute($request->user(), $request->validated(), $kitchenStation)->load('branch'));
    }
}
