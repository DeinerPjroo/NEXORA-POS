<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\PaymentMethod;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SavePaymentMethod
{
    public function create(User $actor, array $data): PaymentMethod
    {
        Gate::authorize('sales.configure');

        return app(IdempotentOperation::class)->run($actor, 'payment-method.create', $data, PaymentMethod::class, function ($data) use ($actor) {
            $this->unique($data);
            $method = PaymentMethod::create($data);
            Audit::record('payment-method.created', 'Se creó un método de pago manual.', $actor, ['payment_method_id' => $method->id, 'kind' => $method->kind]);

            return $method->refresh();
        });
    }

    public function update(User $actor, PaymentMethod $method, array $data): PaymentMethod
    {
        Gate::authorize('sales.configure');

        return DB::transaction(function () use ($actor, $method, $data) {
            Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
            $method = PaymentMethod::whereKey($method->id)->lockForUpdate()->firstOrFail();
            abort_unless($method->revision === (int) $data['revision'], 409, 'El método cambió. Recarga antes de guardarlo.');
            abort_if($method->is_system && ! $data['is_active'], 422, 'El efectivo principal debe permanecer activo.');
            $this->unique($data, $method->id);
            $method->fill($data);
            $method->revision++;
            $method->save();
            Audit::record('payment-method.updated', 'Se actualizó un método de pago.', $actor, ['payment_method_id' => $method->id, 'revision' => $method->revision]);

            return $method;
        });
    }

    private function unique(array $data, ?int $except = null): void
    {
        foreach (['name', 'code'] as $field) {
            if (isset($data[$field]) && PaymentMethod::where($field, $data[$field])->when($except, fn ($q) => $q->where('id', '!=', $except))->exists()) {
                throw ValidationException::withMessages([$field => 'Ya existe un método con este nombre o código.']);
            }
        }
    }
}
