<?php

namespace App\Http\Controllers;

use App\Domains\Reporting\CommercialDashboard;
use App\Http\Requests\CommercialDashboardRequest;

final class CommercialDashboardController extends Controller
{
    public function show(CommercialDashboardRequest $request, CommercialDashboard $service)
    {
        return ['data' => $service->read($request->user(), $request->validated())];
    }
}
