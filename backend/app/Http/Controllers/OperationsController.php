<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use Illuminate\Http\Request;

final class OperationsController extends Controller
{
    public function context(Request $request)
    {
        $allowed = collect(['cash.view', 'cash.manage', 'cash.movements', 'orders.view', 'orders.manage'])->contains(fn ($key) => $request->user()->hasPermission($key));
        abort_unless($allowed, 403);

        return ['branches' => Branch::orderBy('id')->get(['id', 'name', 'is_active']), 'currency' => $request->user()->tenant->currency];
    }
}
