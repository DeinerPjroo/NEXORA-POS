<?php

namespace App\Http\Controllers;

use App\Domains\Sales\SavePaymentMethod;
use App\Http\Requests\PaymentMethodRequest;
use App\Http\Resources\PaymentMethodResource;
use App\Models\PaymentMethod;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class PaymentMethodController extends Controller
{
    public function index(Request $request)
    {
        abort_unless(collect(['sales.configure', 'sales.collect', 'sales.view'])->contains(fn ($p) => $request->user()->hasPermission($p)), 403);
        $data = $request->validate(['status' => ['sometimes', Rule::in(['active', 'inactive'])], 'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:50']]);

        return PaymentMethodResource::collection(PaymentMethod::when(isset($data['status']), fn ($q) => $q->where('is_active', $data['status'] === 'active'))->orderByDesc('is_system')->orderBy('name')->orderBy('id')->paginate($data['per_page'] ?? 20));
    }

    public function store(PaymentMethodRequest $request, SavePaymentMethod $service)
    {
        return (new PaymentMethodResource($service->create($request->user(), $request->validated())))->response()->setStatusCode(201);
    }

    public function update(PaymentMethodRequest $request, PaymentMethod $paymentMethod, SavePaymentMethod $service)
    {
        return new PaymentMethodResource($service->update($request->user(), $paymentMethod, $request->validated()));
    }
}
