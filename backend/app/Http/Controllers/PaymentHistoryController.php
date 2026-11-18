<?php

namespace App\Http\Controllers;

use App\Domains\Sales\PaymentHistory;
use App\Http\Requests\PaymentHistoryRequest;
use App\Http\Resources\PaymentHistoryResource;

final class PaymentHistoryController extends Controller
{
    public function index(PaymentHistoryRequest $request, PaymentHistory $history)
    {
        $result = $history->page($request->user(), $request->validated());

        return PaymentHistoryResource::collection($result['page'])->additional(['summary' => $result['summary'], 'timezone' => $result['timezone']]);
    }
}
