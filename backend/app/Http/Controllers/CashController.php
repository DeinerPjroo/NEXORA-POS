<?php

namespace App\Http\Controllers;

use App\Domains\Cash\CashOperations;
use App\Http\Requests\CashCommandRequest;
use App\Http\Requests\OperationFiltersRequest;
use App\Http\Resources\CashRegisterResource;
use App\Http\Resources\CashSessionResource;
use App\Models\CashRegister;
use App\Models\CashSession;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

final class CashController extends Controller
{
    public function registers(OperationFiltersRequest $request)
    {
        return CashRegisterResource::collection(CashRegister::with('currentSession')->when($request->validated('branch_id'), fn ($q, $id) => $q->where('branch_id', $id))->orderBy('id')->paginate($request->validated('per_page', 20)));
    }

    public function storeRegister(CashCommandRequest $request, CashOperations $service)
    {
        return (new CashRegisterResource($service->createRegister($request->user(), $request->validated())->load('currentSession')))->response()->setStatusCode(201);
    }

    public function sessions(OperationFiltersRequest $request)
    {
        $query = CashSession::with('register')->when($request->validated('branch_id'), fn ($q, $id) => $q->where('branch_id', $id))->when($request->validated('status'), fn ($q, $state) => $q->where('status', $state));

        return CashSessionResource::collection($query->latest('id')->paginate($request->validated('per_page', 20)));
    }

    public function show(CashSession $cashSession)
    {
        Gate::authorize('cash.view');

        return new CashSessionResource($cashSession->load('register'));
    }

    public function movements(OperationFiltersRequest $request, CashSession $cashSession)
    {
        return JsonResource::collection($cashSession->movements()->latest('id')->paginate($request->validated('per_page', 20)));
    }

    public function open(CashCommandRequest $request, CashRegister $cashRegister, CashOperations $service)
    {
        return (new CashSessionResource($service->open($request->user(), $cashRegister, $request->validated())->load('register')))->response()->setStatusCode(201);
    }

    public function move(CashCommandRequest $request, CashSession $cashSession, CashOperations $service)
    {
        return response()->json(['data' => $service->movement($request->user(), $cashSession, $request->validated())], 201);
    }

    public function close(CashCommandRequest $request, CashSession $cashSession, CashOperations $service)
    {
        return new CashSessionResource($service->close($request->user(), $cashSession, $request->validated())->load('register'));
    }
}
