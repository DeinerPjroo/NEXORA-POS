<?php

namespace App\Http\Controllers;

use App\Domains\Studio\SaveStudioTemplate;
use App\Http\Requests\StudioTemplateRequest;
use App\Models\StudioTemplate;
use Illuminate\Support\Facades\Gate;

final class StudioTemplateController extends Controller
{
    public function index()
    {
        Gate::authorize('studio.view');

        return ['data' => StudioTemplate::where('surface', 'pos')->orderBy('name')->limit(50)->get(['id', 'name', 'revision', 'configuration', 'updated_at'])];
    }

    public function save(StudioTemplateRequest $request, SaveStudioTemplate $service)
    {
        return ['data' => $service->execute($request->user(), $request->validated())];
    }
}
