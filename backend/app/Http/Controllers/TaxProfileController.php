<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\CatalogSearch;
use App\Domains\Sales\SaveTaxProfile;
use App\Http\Requests\TaxProfileRequest;
use App\Http\Resources\TaxProfileResource;
use App\Models\TaxProfile;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TaxProfileController extends Controller
{
    public function index(Request $request)
    {
        $configure = $request->user()->hasPermission('sales.configure');
        abort_unless($configure || $request->user()->hasPermission('catalog.view'), 403);
        $data = $request->validate(['status' => ['sometimes', Rule::in($configure ? ['active', 'inactive', 'all'] : ['active'])], 'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:50']]);
        $status = $data['status'] ?? 'active';

        return TaxProfileResource::collection(TaxProfile::when($status !== 'all', fn ($q) => $q->where('is_active', $status === 'active'))
            ->when($data['search'] ?? null, fn ($q, $search) => $q->whereRaw("name LIKE ? ESCAPE '!'", [CatalogSearch::pattern($search)]))->orderBy('name')->orderBy('id')->paginate($data['per_page'] ?? 20));
    }

    public function store(TaxProfileRequest $request, SaveTaxProfile $service)
    {
        return (new TaxProfileResource($service->execute($request->user(), $request->validated())))->response()->setStatusCode(201);
    }

    public function update(TaxProfileRequest $request, TaxProfile $taxProfile, SaveTaxProfile $service)
    {
        return new TaxProfileResource($service->execute($request->user(), $request->validated(), $taxProfile));
    }
}
