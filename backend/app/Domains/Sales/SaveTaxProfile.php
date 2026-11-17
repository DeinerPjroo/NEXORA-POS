<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\TaxProfile;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaveTaxProfile
{
    public function execute(User $actor, array $data, ?TaxProfile $profile = null): TaxProfile
    {
        Gate::authorize('sales.configure');
        if (! $profile) {
            return app(IdempotentOperation::class)->run($actor, 'tax_profile.create', $data, TaxProfile::class, fn ($data) => $this->save($actor, $data));
        }

        return DB::transaction(function () use ($actor, $data, $profile) {
            Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
            $profile = TaxProfile::whereKey($profile->id)->lockForUpdate()->firstOrFail();
            abort_unless($profile->revision === (int) $data['revision'], 409, 'El perfil de impuestos cambió. Revisa su versión actual.');

            return $this->save($actor, $data, $profile);
        });
    }

    private function save(User $actor, array $data, ?TaxProfile $profile = null): TaxProfile
    {
        $existing = $profile !== null;
        if (TaxProfile::where('name', $data['name'])->when($profile, fn ($q) => $q->whereKeyNot($profile->id))->exists()) {
            throw ValidationException::withMessages(['name' => 'Ya existe un perfil con este nombre en tu empresa.']);
        }
        $profile ??= new TaxProfile;
        $profile->fill(['name' => $data['name'], 'price_mode' => $data['price_mode'], 'is_active' => $data['is_active'],
            'rates' => array_map(fn ($rate) => ['name' => $rate['name'], 'rate' => bcadd($rate['rate'], '0', 4)], $data['rates']), 'revision' => $existing ? $profile->revision + 1 : 1]);
        $profile->save();
        Audit::record('sales.tax_profile.'.($existing ? 'updated' : 'created'), 'Se '.($existing ? 'actualizó' : 'creó').' el perfil de impuestos «'.$profile->name.'».', $actor, ['id' => $profile->id, 'revision' => $profile->revision]);

        return $profile;
    }
}
