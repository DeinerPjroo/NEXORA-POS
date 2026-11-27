<?php

namespace App\Http\Controllers;

use App\Domains\Studio\ChangeStudioVersion;
use App\Domains\Studio\LayoutScope;
use App\Domains\Studio\PosLayoutSchema;
use App\Domains\Studio\SavePosLayout;
use App\Domains\Studio\StudioSurface;
use App\Http\Requests\StudioLayoutRequest;
use App\Http\Requests\StudioScopeRequest;
use App\Http\Requests\StudioVersionRequest;
use App\Models\Role;
use App\Models\StudioLayout;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class StudioLayoutController extends Controller
{
    public function versions(StudioScopeRequest $request)
    {
        Gate::authorize('studio.view');
        $data = $request->scopeData();
        $layout = LayoutScope::query($data)->first();
        if (! $layout) {
            return response()->json(['data' => [], 'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 20, 'from' => null, 'to' => null, 'total' => 0]]);
        }

        return JsonResource::collection($layout->versions()->with('actor:id,name', 'archive')->when(! ($data['archived'] ?? false), fn ($q) => $q->whereDoesntHave('archive'))->latest('revision')->paginate(20)->through(fn ($v) => [...$v->only('id', 'revision', 'kind', 'configuration', 'source_version_id', 'reason', 'created_at'), 'author' => $v->actor?->name, 'archive' => $v->archive?->only('reason', 'created_at'), 'current_draft' => $v->revision === $layout->draft_revision, 'current_published' => $v->revision === $layout->published_revision]));
    }

    public function restore(StudioVersionRequest $request, ChangeStudioVersion $service)
    {
        return ['data' => $service->execute($request->user(), $request->scopeData())];
    }

    public function archive(StudioVersionRequest $request, ChangeStudioVersion $service)
    {
        return ['data' => $service->execute($request->user(), $request->scopeData(), true)];
    }

    public function show(StudioScopeRequest $request)
    {
        Gate::authorize('studio.view');

        return ['data' => LayoutScope::query($request->scopeData())->first(), 'defaults' => StudioSurface::defaults($request->route('studio_surface', 'pos'), $request->validated('device', 'adaptive')), 'components' => match ($request->route('studio_surface', 'pos')) {
            'dashboard' => ['totals', 'live', 'chart', 'methods', 'products'], 'deliveries' => ['detail', 'board', 'actions'], 'tables' => ['rooms', 'tables', 'actions'], 'kitchen' => ['new', 'preparing', 'ready'], default => PosLayoutSchema::PANELS
        }, 'roles' => $request->user()->hasPermission('roles.view') ? Role::orderBy('name')->get(['id', 'name']) : []];
    }

    public function active(Request $request)
    {
        $surface = $request->route('studio_surface', 'pos');
        if ($surface === 'dashboard') {
            Gate::authorize('dashboard.view');
        } elseif ($surface === 'deliveries') {
            Gate::authorize('orders.view');
            abort_unless($request->user()->can('orders.manage') || $request->user()->can('deliveries.operate'), 403);
        } elseif ($surface === 'kitchen') {
            Gate::authorize('kitchen.view');
        } elseif ($surface === 'tables') {
            Gate::authorize('dining.view');
        } else {
            Gate::authorize('orders.manage');
            Gate::authorize('catalog.view');
        }
        $data = $request->validate(['device' => ['sometimes', Rule::in(['desktop', 'tablet', 'mobile'])], 'role_id' => ['prohibited'], 'branch_id' => ['prohibited'], 'surface' => ['prohibited']]);
        $device = $data['device'] ?? 'desktop';
        $role = $request->user()->role_id;
        $layouts = StudioLayout::where('surface', $surface)->whereNull('branch_id')->whereNotNull('published')->whereIn('device', [$device, 'adaptive'])->where(fn ($q) => $q->whereNull('role_id')->orWhere('role_id', $role))->get()->sortByDesc(fn ($layout) => ($layout->device === $device ? 2 : 0) + ($layout->role_id !== null ? 1 : 0));
        foreach ($layouts as $layout) {
            try {
                $config = StudioSurface::validate($layout->published, $surface, $layout->device);
            } catch (ValidationException|\TypeError) {
                continue;
            }

            return ['data' => ['layout_id' => $layout->id, 'revision' => $layout->published_revision, 'configuration' => $config]];
        }

        return ['data' => ['layout_id' => null, 'revision' => 0, 'configuration' => StudioSurface::defaults($surface, $device)]];
    }

    public function save(StudioLayoutRequest $request, SavePosLayout $service)
    {
        Gate::authorize('studio.edit');

        return ['data' => $service->execute($request->user(), $request->scopeData())];
    }

    public function publish(StudioLayoutRequest $request, SavePosLayout $service)
    {
        Gate::authorize('studio.publish');

        return ['data' => $service->execute($request->user(), $request->scopeData(), true)];
    }
}
