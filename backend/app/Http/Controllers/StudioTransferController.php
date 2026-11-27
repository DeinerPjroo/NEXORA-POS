<?php

namespace App\Http\Controllers;

use App\Domains\Studio\LayoutScope;
use App\Domains\Studio\SavePosLayout;
use App\Domains\Studio\StudioSurface;
use App\Http\Requests\StudioImportRequest;
use App\Http\Requests\StudioScopeRequest;
use Illuminate\Support\Facades\Gate;

final class StudioTransferController extends Controller
{
    public function export(StudioScopeRequest $request)
    {
        Gate::authorize('studio.view');
        $layout = LayoutScope::query($request->scopeData())->firstOrFail();
        $config = StudioSurface::validate($layout->draft, $layout->surface, $layout->device);

        return response()->json(['format' => 'nexora-studio', 'version' => 1, 'surface' => $layout->surface, 'configuration' => $config])->header('Cache-Control', 'no-store');
    }

    public function import(StudioImportRequest $request, SavePosLayout $service)
    {
        $data = $request->scopeData();
        $data['configuration'] = $data['envelope']['configuration'];
        unset($data['envelope']);
        $data['imported'] = true;

        return ['data' => $service->execute($request->user(), $data)];
    }
}
