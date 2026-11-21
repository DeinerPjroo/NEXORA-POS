<?php

namespace App\Http\Controllers;

use App\Domains\Catalog\CatalogSearch;
use App\Domains\Orders\SaveCustomer;
use App\Http\Requests\CustomerAddressRequest;
use App\Http\Requests\CustomerRequest;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

final class CustomerController extends Controller
{
    public function index(Request $r)
    {
        Gate::authorize('customers.view');
        $d = $r->validate(['branch_id' => ['required', 'integer', 'min:1'], 'search' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        Branch::findOrFail($d['branch_id']);
        $query = Customer::where('branch_id', $d['branch_id'])->where('is_active', true)->with(['addresses' => fn ($q) => $q->where('is_active', true)]);
        if (filled($d['search'] ?? null)) {
            $query->where(function ($q) use ($d) {
                $pattern = CatalogSearch::pattern($d['search']);
                $q->whereRaw("name LIKE ? ESCAPE '!'", [$pattern])->orWhereRaw("phone LIKE ? ESCAPE '!'", [$pattern]);
                $digits = preg_replace('/\D+/', '', $d['search']);
                if ($digits !== '') {
                    $q->orWhere('phone_digits', 'like', '%'.$digits.'%');
                }
            });
        }

        return JsonResource::collection($query->orderBy('name')->orderBy('id')->paginate(20));
    }

    public function show(Customer $customer)
    {
        Gate::authorize('customers.view');

        return ['data' => $customer->load('addresses')];
    }

    public function store(CustomerRequest $r, SaveCustomer $s)
    {
        $customer = $s->execute($r->user(), $r->validated())->load('addresses');

        return response()->json(['data' => [...$customer->toArray(), 'saved_address_id' => isset($r->validated()['initial_address']) ? $customer->addresses->first()?->id : null]], 201);
    }

    public function update(CustomerRequest $r, Customer $customer, SaveCustomer $s)
    {
        return ['data' => $s->execute($r->user(), $r->validated(), $customer)->load('addresses')];
    }

    public function storeAddress(CustomerAddressRequest $r, Customer $customer, SaveCustomer $s)
    {
        $address = $s->address($r->user(), $customer, $r->validated());

        return response()->json(['data' => [...$customer->refresh()->load('addresses')->toArray(), 'saved_address_id' => $address->id]], 201);
    }

    public function updateAddress(CustomerAddressRequest $r, Customer $customer, CustomerAddress $customerAddress, SaveCustomer $s)
    {
        $address = $s->address($r->user(), $customer, $r->validated(), $customerAddress);

        return ['data' => [...$customer->refresh()->load('addresses')->toArray(), 'saved_address_id' => $address->id]];
    }
}
