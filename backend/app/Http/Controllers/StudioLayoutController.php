<?php

namespace App\Http\Controllers;

use App\Domains\Studio\ChangeStudioVersion;
use App\Domains\Studio\PosLayoutSchema;
use App\Domains\Studio\SavePosLayout;
use App\Http\Requests\StudioLayoutRequest;
use App\Http\Requests\StudioVersionRequest;
use App\Models\StudioLayout;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class StudioLayoutController extends Controller
{
    public function versions(Request $request)
    {
        Gate::authorize('studio.view');
        $data = $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'archived' => ['sometimes', 'boolean']]);
        $layout = StudioLayout::where('surface', 'pos')->first();
        if (! $layout) {
            return response()->json(['data' => [], 'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 20, 'from' => null, 'to' => null, 'total' => 0]]);
        }

        return JsonResource::collection($layout->versions()->with('actor:id,name', 'archive')->when(! ($data['archived'] ?? false), fn ($q) => $q->whereDoesntHave('archive'))->latest('revision')->paginate(20)->through(fn ($v) => [...$v->only('id', 'revision', 'kind', 'configuration', 'source_version_id', 'reason', 'created_at'), 'author' => $v->actor?->name, 'archive' => $v->archive?->only('reason', 'created_at'), 'current_draft' => $v->revision === $layout->draft_revision, 'current_published' => $v->revision === $layout->published_revision]));
    }

    public function restore(StudioVersionRequest $request, ChangeStudioVersion $service)
    {
        return ['data' => $service->execute($request->user(), $request->validated())];
    }

    public function archive(StudioVersionRequest $request, ChangeStudioVersion $service)
    {
        return ['data' => $service->execute($request->user(), $request->validated(), true)];
    }

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
