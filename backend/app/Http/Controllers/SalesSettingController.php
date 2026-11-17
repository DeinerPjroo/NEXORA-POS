<?php

namespace App\Http\Controllers;

use App\Domains\Identity\Audit;
use App\Http\Requests\SalesSettingRequest;
use App\Models\SalesSetting;
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
            if ($data['tax_mode'] === 'none' && bccomp($data['tax_rate'], '0', 4) !== 0) {
                throw ValidationException::withMessages(['tax_rate' => 'Sin cálculo de impuesto adicional, la tasa debe ser cero.']);
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
            $settings->save();
            Audit::record('sales.settings.updated', 'Se confirmó la configuración de cálculo de ventas.', $request->user(), ['revision' => $settings->revision, 'tax_mode' => $settings->tax_mode, 'tax_rate' => $settings->tax_rate, 'tip_enabled' => $settings->tip_enabled, 'tip_tax_mode' => $settings->tip_tax_mode]);

            return ['data' => $this->resource($settings)];
        });
    }

    private function resource(SalesSetting $settings): array
    {
        return [...$settings->only('configured', 'tax_mode', 'tax_name', 'tax_rate', 'revision', 'tip_enabled', 'tip_tax_mode'), 'rounding' => 'half_up', 'decimal_places' => 2];
    }
}
