<?php

namespace App\Domains\Orders;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Models\Branch;
use App\Models\DeliveryPolicy;
use App\Models\DeliveryZone;
use App\Models\TaxProfile;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class SaveDeliveryTariff
{
    public function policy(User $actor, array $data): DeliveryPolicy
    {
        Gate::authorize('deliveries.configure');

        return app(IdempotentOperation::class)->run($actor, 'delivery.policy.'.$data['branch_id'], $data, DeliveryPolicy::class, function ($data) use ($actor) {
            $branch = Branch::findOrFail($data['branch_id']);
            abort_unless($branch->is_active, 409, 'La sucursal está inactiva.');
            abort_unless($actor->tenant()->value('currency') === $data['currency'], 409, 'La moneda cambió. Revisa las tarifas.');
            $policy = DeliveryPolicy::where('branch_id', $branch->id)->lockForUpdate()->first();
            abort_unless(($policy?->revision ?? 0) === (int) $data['revision'], 409, 'La configuración cambió. Vuelve a consultarla.');
            if ($data['tax_profile_id'] ?? null) {
                $profile = TaxProfile::findOrFail($data['tax_profile_id']);
                abort_unless($profile->is_active && $profile->revision === (int) $data['tax_profile_revision'], 409, 'El perfil de impuestos cambió o está archivado.');
            }
            $policy ??= new DeliveryPolicy(['branch_id' => $branch->id, 'revision' => 0]);
            $policy->fill(['currency' => $data['currency'], 'is_enabled' => $data['is_enabled'], 'default_fee' => Money::normalize($data['default_fee']), 'free_from' => isset($data['free_from']) ? Money::normalize($data['free_from']) : null, 'tax_profile_id' => $data['tax_profile_id'] ?? null]);
            $policy->revision++;
            $policy->save();
            Audit::record('delivery.tariffs.saved', 'Se configuraron tarifas de domicilio.', $actor, ['policy_id' => $policy->id, 'revision' => $policy->revision]);

            return $policy;
        });
    }

    public function zone(User $actor, DeliveryPolicy $policy, array $data, ?DeliveryZone $zone = null): DeliveryPolicy
    {
        Gate::authorize('deliveries.configure');

        return app(IdempotentOperation::class)->run($actor, 'delivery.zone.'.$policy->id.'.'.($zone?->id ?? 'new'), $data, DeliveryPolicy::class, function ($data) use ($actor, $policy, $zone) {
            $policy = DeliveryPolicy::whereKey($policy->id)->lockForUpdate()->firstOrFail();
            abort_unless($policy->revision === (int) $data['revision'], 409, 'Las tarifas cambiaron. Actualiza antes de guardar.');
            abort_unless($policy->currency === $actor->tenant()->value('currency'), 409, 'Revisa la moneda de las tarifas.');
            if ($zone) {
                $zone = DeliveryZone::where('delivery_policy_id', $policy->id)->whereKey($zone->id)->lockForUpdate()->firstOrFail();
                abort_unless($zone->revision === (int) $data['zone_revision'], 409, 'La zona cambió.');
                $zone->revision++;
            } else {
                abort_if($policy->zones()->count() >= 40, 422, 'Máximo 40 zonas por sucursal.');
                $zone = new DeliveryZone(['delivery_policy_id' => $policy->id, 'branch_id' => $policy->branch_id, 'revision' => 1]);
            }
            abort_if($policy->zones()->where('name', $data['name'])->when($zone->exists, fn ($q) => $q->whereKeyNot($zone->id))->exists(), 409, 'Ya existe una zona con ese nombre.');
            $zone->fill(['name' => $data['name'], 'fee' => Money::normalize($data['fee']), 'is_active' => $data['is_active']]);
            $zone->save();
            $policy->revision++;
            $policy->save();
            Audit::record('delivery.zone.saved', 'Se guardó una zona de domicilio.', $actor, ['zone_id' => $zone->id, 'policy_id' => $policy->id, 'revision' => $policy->revision]);

            return $policy;
        });
    }
}
