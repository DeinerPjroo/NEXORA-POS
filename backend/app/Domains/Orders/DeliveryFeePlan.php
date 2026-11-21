<?php

namespace App\Domains\Orders;

use App\Domains\Operations\Money;
use App\Domains\Sales\ProductTaxTotals;
use App\Domains\Sales\SaleTotals;
use App\Models\DeliveryPolicy;
use App\Models\DeliveryZone;
use App\Models\TaxProfile;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class DeliveryFeePlan
{
    public function resolve(User $actor, int $branchId, string $currency, string $subtotal, array $data, bool $expectations = true): array
    {
        $policy = DeliveryPolicy::where('branch_id', $branchId)->first();
        if ($expectations && isset($data['fee_policy_revision'])) {
            abort_unless((int) $data['fee_policy_revision'] === ($policy?->revision ?? 0), 409, 'Las tarifas cambiaron. Revisa el domicilio.');
        }
        if (! $policy?->is_enabled) {
            abort_if(isset($data['fee_override']) || ! empty($data['delivery_zone_id']), 409, 'Configura las tarifas antes de elegir zona o ajuste manual.');
            abort_if(isset($data['expected_fee_total']) && bccomp($data['expected_fee_total'], '0', 4) !== 0, 409, 'Las tarifas cambiaron. Revisa el domicilio.');

            return ['delivery_policy_id' => $policy?->id, 'delivery_zone_id' => null, 'fee_total' => '0.0000', 'fee_snapshot' => null];
        }
        abort_unless($policy->currency === $currency, 409, 'Revisa la moneda de las tarifas.');
        if ($expectations) {
            abort_unless((int) ($data['fee_policy_revision'] ?? 0) === $policy->revision, 409, 'Revisa y confirma la tarifa vigente.');
        }
        $profile = TaxProfile::whereKey($policy->tax_profile_id)->firstOrFail();
        abort_unless($profile->is_active, 409, 'El perfil de impuestos de domicilio está archivado. Reconfigura las tarifas.');
        if ($expectations) {
            abort_unless((int) ($data['fee_profile_revision'] ?? 0) === $profile->revision, 409, 'Los impuestos de domicilio cambiaron. Revisa la tarifa.');
        }
        $zone = null;
        if (! empty($data['delivery_zone_id'])) {
            $zone = DeliveryZone::where('delivery_policy_id', $policy->id)->where('branch_id', $branchId)->whereKey($data['delivery_zone_id'])->firstOrFail();
            abort_unless($zone->is_active, 409, 'La zona está archivada.');
            if ($expectations) {
                abort_unless((int) ($data['fee_zone_revision'] ?? 0) === $zone->revision, 409, 'La zona cambió. Revisa la tarifa.');
            }
        }
        $amount = $zone?->fee ?? $policy->default_fee;
        $source = $zone ? 'zone' : 'fixed';
        if ($policy->free_from !== null && bccomp($subtotal, $policy->free_from, 4) >= 0) {
            $amount = '0.0000';
            $source = 'free_threshold';
        }
        $reason = null;
        if (isset($data['fee_override'])) {
            Gate::authorize('deliveries.override_fee');
            abort_unless(filled($data['fee_override_reason'] ?? null), 422, 'Indica el motivo del ajuste de domicilio.');
            $amount = Money::normalize($data['fee_override']);
            $source = 'manual';
            $reason = $data['fee_override_reason'];
        }
        $line = app(ProductTaxTotals::class)->line(SaleTotals::round($amount), $profile->snapshot());
        $tax = Money::bounded(bcadd($line['included_tax_amount'], $line['additional_tax_amount'], 4));
        if ($expectations) {
            abort_unless(isset($data['expected_fee_total']) && bccomp($data['expected_fee_total'], $line['total'], 4) === 0, 409, 'El costo del domicilio cambió. Revisa y confirma su tarifa.');
        }

        return ['delivery_policy_id' => $policy->id, 'delivery_zone_id' => $zone?->id, 'fee_total' => $line['total'], 'fee_snapshot' => ['version' => 1, 'currency' => $currency, 'policy_revision' => $policy->revision, 'zone_revision' => $zone?->revision, 'zone_name' => $zone?->name, 'source' => $source, 'reason' => $reason, 'actor_id' => $actor->id, 'tax_amount' => $tax, ...$line]];
    }
}
