<?php

namespace App\Http\Controllers;

use App\Domains\Orders\TransferCourierCash;
use App\Http\Requests\CourierCashRequest;
use App\Models\Branch;
use App\Models\CourierCashAccount;
use App\Models\CourierCashTransfer;
use App\Models\User;
use Illuminate\Http\Request;

final class CourierCashController extends Controller
{
    public function index(Request $request)
    {
        TransferCourierCash::authorize();
        $data = $request->validate(['branch_id' => ['required', 'integer', 'min:1']]);
        $branch = Branch::findOrFail($data['branch_id']);
        $currency = $request->user()->tenant->currency;
        $accounts = CourierCashAccount::where('branch_id', $branch->id)->where('currency', $currency)->get()->keyBy('courier_id');
        $users = User::where('tenant_id', $request->user()->tenant_id)->with('role.permissions')->where(fn ($q) => $q->where(fn ($q) => $q->where('is_active', true)->whereHas('role.permissions', fn ($q) => $q->where('key', 'deliveries.operate')))->orWhereIn('id', $accounts->keys()))->orderBy('name')->get();

        return ['currency' => $currency, 'data' => $users->filter(fn ($user) => $accounts->has($user->id) || $user->canAccessBranch($branch->id))->map(fn ($user) => [
            'courier_id' => $user->id, 'name' => $user->name, 'balance' => $accounts->get($user->id)?->balance ?? '0.0000', 'revision' => $accounts->get($user->id)?->revision ?? 0,
            'can_receive' => $branch->is_active && $user->is_active && $user->hasPermission('deliveries.operate') && $user->canAccessBranch($branch->id),
        ])->values()];
    }

    public function history(Request $request, int $courier)
    {
        TransferCourierCash::authorize();
        $data = $request->validate(['branch_id' => ['required', 'integer', 'min:1'], 'page' => ['sometimes', 'integer', 'min:1']]);
        Branch::findOrFail($data['branch_id']);
        $account = CourierCashAccount::where('branch_id', $data['branch_id'])->where('courier_id', $courier)->where('currency', $request->user()->tenant->currency)->first();

        return CourierCashTransfer::where('courier_cash_account_id', $account?->id ?? 0)->latest('id')->paginate(20);
    }

    public function store(CourierCashRequest $request, int $courier, TransferCourierCash $service)
    {
        return ['data' => $service->execute($request->user(), $courier, $request->validated())];
    }
}
