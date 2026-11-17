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
            $settings->fill(['configured' => true, 'tax_mode' => $data['tax_mode'], 'tax_name' => $data['tax_name'], 'tax_rate' => $data['tax_rate'], 'revision' => $settings->revision + 1])->save();
            Audit::record('sales.settings.updated', 'Se confirmó la configuración de cálculo de ventas.', $request->user(), ['revision' => $settings->revision, 'tax_mode' => $settings->tax_mode, 'tax_rate' => $settings->tax_rate]);

            return ['data' => $this->resource($settings)];
        });
    }

    private function resource(SalesSetting $settings): array
    {
        return [...$settings->only('configured', 'tax_mode', 'tax_name', 'tax_rate', 'revision'), 'rounding' => 'half_up', 'decimal_places' => 2];
    }
}
