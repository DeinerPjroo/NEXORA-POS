<?php

namespace App\Http\Controllers;

use App\Domains\Studio\ChangeStudioVersion;
use App\Domains\Studio\PosLayoutSchema;
use App\Domains\Studio\SavePosLayout;
use App\Domains\Studio\LayoutScope;
use App\Http\Requests\StudioLayoutRequest;
use App\Http\Requests\StudioVersionRequest;
use App\Http\Requests\StudioScopeRequest;
use App\Models\StudioLayout;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class StudioLayoutController extends Controller
{
    public function versions(StudioScopeRequest $request)
    {
        Gate::authorize('studio.view');
        $data = $request->validated();
        $layout = LayoutScope::query($data)->first();
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

    public function show(StudioScopeRequest $request)
    {
        Gate::authorize('studio.view');

        return ['data' => LayoutScope::query($request->validated())->first(), 'defaults' => LayoutScope::defaults($request->validated('device', 'adaptive')), 'components' => PosLayoutSchema::PANELS, 'roles' => $request->user()->hasPermission('roles.view') ? Role::orderBy('name')->get(['id', 'name']) : []];
    }

    public function active(Request $request)
    {
        Gate::authorize('orders.manage');
        Gate::authorize('catalog.view');
        $data = $request->validate(['device' => ['sometimes', \Illuminate\Validation\Rule::in(['desktop', 'tablet', 'mobile'])], 'role_id' => ['prohibited'], 'branch_id' => ['prohibited']]);
        $device = $data['device'] ?? 'desktop';
        $role = $request->user()->role_id;
        $layouts = StudioLayout::where('surface', 'pos')->whereNull('branch_id')->whereNotNull('published')->whereIn('device', [$device, 'adaptive'])->where(fn ($q) => $q->whereNull('role_id')->orWhere('role_id', $role))->get()->sortByDesc(fn ($layout) => ($layout->device === $device ? 2 : 0) + ($layout->role_id !== null ? 1 : 0));
        foreach ($layouts as $layout) {
            try { $config = PosLayoutSchema::validate($layout->published); }
            catch (ValidationException|\TypeError) { continue; }
            return ['data' => ['layout_id' => $layout->id, 'revision' => $layout->published_revision, 'configuration' => $config]];
        }
        return ['data' => ['layout_id' => null, 'revision' => 0, 'configuration' => PosLayoutSchema::defaults()]];
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
