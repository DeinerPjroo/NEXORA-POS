<?php

namespace App\Http\Controllers;

use App\Domains\Studio\PosLayoutSchema;
use App\Domains\Studio\SavePosLayout;
use App\Http\Requests\StudioLayoutRequest;
use App\Models\StudioLayout;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class StudioLayoutController extends Controller
{
    public function show()
    {
        Gate::authorize('studio.view');

        return ['data' => StudioLayout::where('surface', 'pos')->first(), 'defaults' => PosLayoutSchema::defaults(), 'components' => PosLayoutSchema::PANELS];
    }

    public function active()
    {
        Gate::authorize('orders.manage');
        Gate::authorize('catalog.view');
        $layout = StudioLayout::where('surface', 'pos')->first();
        try {
            $config = $layout?->published ? PosLayoutSchema::validate($layout->published) : PosLayoutSchema::defaults();
        } catch (ValidationException|\TypeError) {
            $config = PosLayoutSchema::defaults();
        }

        return ['data' => ['revision' => $layout?->published_revision ?? 0, 'configuration' => $config]];
    }

    public function save(StudioLayoutRequest $request, SavePosLayout $service)
    {
        Gate::authorize('studio.edit');

        return ['data' => $service->execute($request->user(), $request->validated())];
    }

    public function publish(StudioLayoutRequest $request, SavePosLayout $service)
    {
        Gate::authorize('studio.publish');

        return ['data' => $service->execute($request->user(), $request->validated(), true)];
    }
}
