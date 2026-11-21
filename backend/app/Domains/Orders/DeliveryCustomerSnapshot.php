<?php

namespace App\Domains\Orders;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class DeliveryCustomerSnapshot
{
    public function resolve(User $actor, int $branchId, array $data): array
    {
        $contact = collect($data)->only(['recipient_name', 'phone', 'address', 'neighborhood', 'location_reference', 'instructions'])->all();
        $customer = null;
        $address = null;
        if (! empty($data['customer_id'])) {
            Gate::authorize('customers.view');
            $customer = Customer::where('branch_id', $branchId)->whereKey($data['customer_id'])->lockForUpdate()->firstOrFail();
            abort_unless($customer->is_active && $customer->revision === (int) ($data['customer_revision'] ?? 0), 409, 'El cliente cambió. Vuelve a seleccionarlo.');
            if (! empty($data['customer_address_id'])) {
                $address = CustomerAddress::where('customer_id', $customer->id)->where('branch_id', $branchId)->whereKey($data['customer_address_id'])->lockForUpdate()->firstOrFail();
                abort_unless($address->is_active && $address->revision === (int) ($data['address_revision'] ?? 0), 409, 'La dirección cambió. Vuelve a seleccionarla.');
                $contact = $address->only(['recipient_name', 'phone', 'address', 'neighborhood', 'location_reference', 'instructions']);
            }
        }

        return [...$contact, 'customer_id' => $customer?->id, 'customer_address_id' => $address?->id, 'customer_snapshot' => ['version' => 1, 'customer' => $customer?->only('id', 'name', 'phone', 'revision'), 'address_id' => $address?->id, 'address_revision' => $address?->revision, 'contact' => $contact]];
    }
}
