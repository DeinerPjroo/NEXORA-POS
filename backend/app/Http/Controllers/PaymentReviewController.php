<?php

namespace App\Http\Controllers;

use App\Domains\Sales\ReviewPayment;
use App\Http\Requests\PaymentReviewRequest;
use App\Http\Resources\PaymentReviewResource;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

final class PaymentReviewController extends Controller
{
    public function index(Request $request, Payment $payment)
    {
        Gate::authorize('sales.view');
        $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'tenant_id' => ['prohibited']]);

        return PaymentReviewResource::collection($payment->reviews()->orderByDesc('id')->paginate(10));
    }

    public function store(PaymentReviewRequest $request, Payment $payment, ReviewPayment $review)
    {
        return (new PaymentReviewResource($review->execute($request->user(), $payment, $request->validated())))->response()->setStatusCode(201);
    }
}
