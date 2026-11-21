<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class SaveCustomer
{
    private function authorize(): void
    {
        Gate::authorize('customers.view');
        Gate::authorize('customers.manage');
    }

    public function execute(User $actor, array $data, ?Customer $customer = null): Customer
    {
        $this->authorize();

        return app(IdempotentOperation::class)->run($actor, 'customer.save.'.($customer?->id ?? 'new'), $data, Customer::class, function ($data) use ($actor, $customer) {
            if ($customer) {
                $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
                abort_unless($customer->revision === (int) $data['revision'], 409, 'El cliente cambió. Consulta sus datos antes de guardar.');
                $customer->revision++;
            } else {
                $branch = Branch::findOrFail($data['branch_id']);
                abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
                $customer = new Customer(['branch_id' => $branch->id, 'revision' => 1]);
            }
            $customer->fill(['name' => $data['name'], 'phone' => $data['phone'], 'phone_digits' => preg_replace('/\D+/', '', $data['phone']), 'is_active' => $data['is_active'] ?? $customer->is_active ?? true]);
            $customer->save();
            if (isset($data['initial_address'])) {
                CustomerAddress::create([...$data['initial_address'], 'customer_id' => $customer->id, 'branch_id' => $customer->branch_id, 'revision' => 1]);
            }
            Audit::record('customer.saved', 'Se guardó un cliente y sus datos de contacto.', $actor, ['customer_id' => $customer->id, 'revision' => $customer->revision]);

            return $customer;
        });
    }

    public function address(User $actor, Customer $customer, array $data, ?CustomerAddress $address = null): CustomerAddress
    {
        $this->authorize();

        return app(IdempotentOperation::class)->run($actor, 'customer.address.'.$customer->id.'.'.($address?->id ?? 'new'), $data, CustomerAddress::class, function ($data) use ($actor, $customer, $address) {
            $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
            abort_unless($customer->is_active && $customer->revision === (int) $data['revision'], 409, 'El cliente cambió o está archivado. Actualiza sus datos.');
            if ($address) {
                $address = CustomerAddress::where('customer_id', $customer->id)->whereKey($address->id)->lockForUpdate()->firstOrFail();
                abort_unless($address->revision === (int) $data['address_revision'], 409, 'La dirección cambió. Actualiza antes de guardar.');
                $address->revision++;
            } else {
                $address = new CustomerAddress(['customer_id' => $customer->id, 'branch_id' => $customer->branch_id, 'revision' => 1]);
            }
            if (($data['is_active'] ?? true) && (! $address->exists || ! $address->is_active)) {
                abort_if($customer->addresses()->where('is_active', true)->count() >= 20, 422, 'Máximo 20 direcciones activas por cliente.');
            }
            $address->fill(collect($data)->only(['label', 'recipient_name', 'phone', 'address', 'neighborhood', 'location_reference', 'instructions', 'is_active'])->all());
            $address->save();
            $customer->revision++;
            $customer->save();
            Audit::record('customer.address.saved', 'Se guardó una dirección del cliente.', $actor, ['customer_id' => $customer->id, 'address_id' => $address->id, 'revision' => $customer->revision]);

            return $address;
        });
    }
}
