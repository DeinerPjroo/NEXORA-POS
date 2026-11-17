<?php

namespace App\Http\Controllers;

use App\Domains\Cash\DefaultRegister;
use App\Domains\Identity\Audit;
use App\Http\Requests\BranchRequest;
use App\Models\Branch;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class BranchController extends Controller
{
    public function index()
    {
        Gate::authorize('viewAny', Branch::class);

        return Branch::orderBy('id')->get();
    }

    public function store(BranchRequest $request)
    {
        Gate::authorize('create', Branch::class);
        $branch = DB::transaction(function () use ($request) {
            $branch = Branch::create($request->validated());
            DefaultRegister::create($branch);
            Audit::record('branch.created', 'Se creó la sucursal '.$branch->name.'.', $request->user(), ['branch_id' => $branch->id]);

            return $branch;
        });

        return response()->json($branch, 201);
    }

    public function update(BranchRequest $request, Branch $branch)
    {
        Gate::authorize('update', $branch);

        return DB::transaction(function () use ($request, $branch) {
            $branch->update($request->validated());
            Audit::record('branch.updated', 'Se actualizó la sucursal '.$branch->name.'.', $request->user(), ['branch_id' => $branch->id]);

            return $branch;
        });
    }
}
