<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\AvailabilitySchedule;
use App\Domains\Catalog\SaveAvailability;
use App\Http\Requests\AvailabilityFiltersRequest;
use App\Http\Requests\AvailabilityPolicyRequest;
use App\Http\Requests\AvailabilityWindowRequest;
use App\Http\Resources\AvailabilityWindowResource;
use App\Models\Product;
use App\Models\ProductAvailabilityWindow;
use Illuminate\Database\Eloquent\Collection;

final class ProductAvailabilityController extends Controller
{
    public function index(AvailabilityFiltersRequest $request, Product $product)
    {
        $data = $request->validated();
        $query = $product->availabilityWindows()->when($data['status'] ?? null, fn ($q, $status) => $q->where('is_active', $status === 'active'));
        app(AvailabilitySchedule::class)->decorate(new Collection([$product]), $request->user()->tenant()->value('timezone'));

        return AvailabilityWindowResource::collection($query->orderBy('weekday')->orderBy('start_time')->orderBy('id')->paginate($data['per_page'] ?? 10))
            ->additional(['product_revision' => $product->revision, 'enabled' => $product->availability_schedule_enabled, 'availability_context' => $product->getAttribute('availability_context')]);
    }

    public function policy(AvailabilityPolicyRequest $request, Product $product, SaveAvailability $service)
    {
        $product = $service->policy($request->user(), $product, $request->validated());

        return ['data' => ['product_revision' => $product->revision, 'enabled' => $product->availability_schedule_enabled]];
    }

    public function store(AvailabilityWindowRequest $request, Product $product, SaveAvailability $service)
    {
        return (new AvailabilityWindowResource($service->window($request->user(), $product, $request->validated())))->response()->setStatusCode(201);
    }

    public function update(AvailabilityWindowRequest $request, Product $product, ProductAvailabilityWindow $availabilityWindow, SaveAvailability $service)
    {
        return new AvailabilityWindowResource($service->window($request->user(), $product, $request->validated(), $availabilityWindow));
    }
}
