<?php

namespace App\Http\Controllers;

use App\Domains\Dining\SaveReservation;
use App\Http\Requests\DiningReservationFiltersRequest;
use App\Http\Requests\DiningReservationRequest;
use App\Http\Requests\DiningReservationStateRequest;
use App\Http\Resources\DiningReservationResource;
use App\Models\DiningReservation;
use App\Models\DiningTable;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

final class DiningReservationController extends Controller
{
    public function index(DiningReservationFiltersRequest $request)
    {
        $d = $request->validated();
        $q = DiningReservation::with('tables.table', 'branch')
            ->when($d['branch_id'] ?? null, fn ($q, $id) => $q->where('branch_id', $id))
            ->when($d['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($d['search'] ?? null, fn ($q, $s) => $q->where('guest_name', 'like', '%'.$s.'%'));
        if ($d['date'] ?? null) {
            $day = CarbonImmutable::createFromFormat('!Y-m-d', $d['date'], $request->user()->tenant()->firstOrFail()->timezone);
            $q->where('starts_at', '<', $day->addDay()->setTimezone(config('app.timezone')))->where('ends_at', '>', $day->setTimezone(config('app.timezone')));
        }

        return DiningReservationResource::collection($q->orderBy('starts_at')->orderBy('id')->paginate($d['per_page'] ?? 20));
    }

    public function show(DiningReservation $diningReservation)
    {
        Gate::authorize('dining.reserve');

        return $this->detail($diningReservation);
    }

    public function store(DiningReservationRequest $request, SaveReservation $service)
    {
        return $this->detail($service->save($request->user(), $request->validated()))->response()->setStatusCode(201);
    }

    public function update(DiningReservationRequest $request, DiningReservation $diningReservation, SaveReservation $service)
    {
        return $this->detail($service->save($request->user(), $request->validated(), $diningReservation));
    }

    public function state(DiningReservationStateRequest $request, DiningReservation $diningReservation, SaveReservation $service)
    {
        return $this->detail($service->state($request->user(), $diningReservation, $request->validated()));
    }

    public function tables(Request $request)
    {
        Gate::authorize('dining.reserve');
        $d = $request->validate(['branch_id' => ['required', 'integer'], 'page' => ['sometimes', 'integer', 'min:1']]);

        return JsonResource::collection(DiningTable::where('branch_id', $d['branch_id'])->where('is_active', true)->whereHas('room', fn ($q) => $q->where('is_active', true))->with('room:id,name')->orderBy('name')->orderBy('id')->paginate(50)->through(fn ($t) => [...$t->only(['id', 'name', 'capacity', 'revision']), 'room_name' => $t->room->name]));
    }

    private function detail(DiningReservation $r): DiningReservationResource
    {
        return new DiningReservationResource($r->load('tables.table', 'branch'));
    }
}
