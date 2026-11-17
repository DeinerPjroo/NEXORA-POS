<?php

namespace App\Http\Controllers;

use App\Domains\Identity\Audit;
use App\Http\Requests\SalesSettingRequest;
use App\Models\Order;
use App\Models\SalesSetting;
use App\Models\TaxProfile;
use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class SalesSettingController extends Controller
{
    public function show(Request $request)
    {
        abort_unless(collect(['sales.view', 'sales.collect', 'sales.configure'])->contains(fn ($p) => $request->user()->hasPermission($p)), 403);

        return ['data' => $this->resource(SalesSetting::firstOrFail())];
    }

    public function update(SalesSettingRequest $request)
    {
        return DB::transaction(function () use ($request) {
            Tenant::whereKey($request->user()->tenant_id)->lockForUpdate()->firstOrFail();
            $settings = SalesSetting::lockForUpdate()->firstOrFail();
            $data = $request->validated();
            abort_unless($settings->revision === (int) $data['revision'], 409, 'La configuración cambió. Recarga antes de guardarla.');
            if (in_array($data['tax_mode'], ['none', 'product'], true) && bccomp($data['tax_rate'], '0', 4) !== 0) {
                throw ValidationException::withMessages(['tax_rate' => 'Sin cálculo de impuesto adicional, la tasa debe ser cero.']);
            }
            if ($data['tax_mode'] === 'product') {
                abort_if(Order::where('status', '!=', 'cancelled')->whereDoesntHave('sale')->whereHas('items', fn ($q) => $q->whereNull('tax_snapshot'))->exists(), 409, 'Resuelve los pedidos anteriores sin snapshot de impuestos antes de activar el cálculo por producto.');
            }
            $settings->fill(['configured' => true, 'tax_mode' => $data['tax_mode'], 'tax_name' => $data['tax_name'], 'tax_rate' => $data['tax_rate'], 'revision' => $settings->revision + 1]);
            if (array_key_exists('tip_enabled', $data)) {
                $settings->tip_enabled = $data['tip_enabled'];
            }
            if (array_key_exists('tip_tax_mode', $data)) {
                $settings->tip_tax_mode = $data['tip_tax_mode'];
            }
            if ($settings->tip_enabled && ! in_array($settings->tip_tax_mode, ['included', 'excluded'], true)) {
                throw ValidationException::withMessages(['tip_tax_mode' => 'Selecciona el tratamiento de base de las propinas antes de habilitarlas.']);
            }
            if ($settings->tax_mode === 'product' && $settings->tip_enabled && $settings->tip_tax_mode === 'included') {
                if (array_key_exists('tip_tax_profile_id', $data) && $data['tip_tax_profile_id'] === null) {
                    $settings->tip_tax_snapshot = null;
                }
                if (isset($data['tip_tax_profile_id'])) {
                    $profile = TaxProfile::whereKey($data['tip_tax_profile_id'])->lockForUpdate()->firstOrFail();
                    abort_unless($profile->is_active && $profile->revision === (int) $data['tip_tax_profile_revision'], 409, 'El perfil de impuestos de propina cambió. Revisa su versión.');
                    $settings->tip_tax_snapshot = $profile->snapshot();
                }
                if (! $settings->tip_tax_snapshot) {
                    throw ValidationException::withMessages(['tip_tax_profile_id' => 'Selecciona y confirma un perfil de impuestos para la propina participante.']);
                }
            } else {
                $settings->tip_tax_snapshot = null;
            }
            $settings->save();
            Audit::record('sales.settings.updated', 'Se confirmó la configuración de cálculo de ventas.', $request->user(), ['revision' => $settings->revision, 'tax_mode' => $settings->tax_mode, 'tax_rate' => $settings->tax_rate, 'tip_enabled' => $settings->tip_enabled, 'tip_tax_mode' => $settings->tip_tax_mode]);

            return ['data' => $this->resource($settings)];
        });
    }

    private function resource(SalesSetting $settings): array
    {
        return [...$settings->only('configured', 'tax_mode', 'tax_name', 'tax_rate', 'revision', 'tip_enabled', 'tip_tax_mode', 'tip_tax_snapshot'), 'rounding' => 'half_up', 'decimal_places' => 2];
    }
}
