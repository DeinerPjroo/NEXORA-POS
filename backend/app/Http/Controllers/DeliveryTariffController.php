<?php

namespace App\Http\Controllers;

use App\Domains\Operations\Money;
use App\Domains\Orders\PreviewDelivery;
use App\Domains\Orders\SaveDeliveryTariff;
use App\Domains\Sales\SaleTotals;
use App\Http\Requests\DeliveryTariffRequest;
use App\Http\Requests\OrderLineRules;
use App\Models\Branch;
use App\Models\DeliveryPolicy;
use App\Models\DeliveryZone;
use App\Models\TaxProfile;
use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class DeliveryTariffController extends Controller
{
    public static function feeRules(): array
    {
        return ['delivery_zone_id' => ['nullable', 'integer', 'min:1'], 'fee_override' => ['sometimes', ...SaleTotals::cashRules()], 'fee_override_reason' => ['required_with:fee_override', 'nullable', 'string', 'min:3', 'max:250']];
    }

    public function context(Request $r)
    {
        abort_unless($r->user()->can('orders.view') && $r->user()->can('orders.manage'), 403);
        $d = $r->validate(['branch_id' => ['required', 'integer', 'min:1']]);
        Branch::findOrFail($d['branch_id']);
        $p = DeliveryPolicy::where('branch_id', $d['branch_id'])->with(['zones' => fn ($q) => $q->where('is_active', true)])->first();

        return ['data' => $p ? [...$p->only('id', 'branch_id', 'currency', 'is_enabled', 'default_fee', 'free_from', 'revision'), 'zones' => $p->zones->map(fn ($z) => $z->only('id', 'name', 'fee', 'revision'))] : ['id' => null, 'branch_id' => (int) $d['branch_id'], 'currency' => $r->user()->tenant()->value('currency'), 'is_enabled' => false, 'default_fee' => '0.0000', 'free_from' => null, 'revision' => 0, 'zones' => []]];
    }

    public function settings(Request $r)
    {
        Gate::authorize('deliveries.configure');
        $d = $r->validate(['branch_id' => ['required', 'integer', 'min:1']]);
        Branch::findOrFail($d['branch_id']);

        return ['data' => ['policy' => DeliveryPolicy::where('branch_id', $d['branch_id'])->with('zones')->first(), 'profiles' => TaxProfile::where('is_active', true)->get()->map(fn ($p) => $p->snapshot()), 'currency' => $r->user()->tenant()->value('currency')]];
    }

    public function save(DeliveryTariffRequest $r, SaveDeliveryTariff $s)
    {
        return ['data' => $s->policy($r->user(), $r->validated())->load('zones')];
    }

    public function zone(Request $r, DeliveryPolicy $deliveryPolicy, SaveDeliveryTariff $s, ?DeliveryZone $deliveryZone = null)
    {
        Gate::authorize('deliveries.configure');
        $d = $r->validate(['tenant_id' => ['prohibited'], 'branch_id' => ['prohibited'], 'idempotency_key' => ['required', 'uuid'], 'revision' => ['required', 'integer', 'min:1'], 'zone_revision' => [$deliveryZone ? 'required' : 'prohibited', 'integer', 'min:1'], 'name' => ['required', 'string', 'max:100'], 'fee' => ['required', ...SaleTotals::cashRules()], 'is_active' => ['required', 'boolean']]);

        return ['data' => $s->zone($r->user(), $deliveryPolicy, $d, $deliveryZone)->load('zones')];
    }

    public function preview(Request $r, PreviewDelivery $plan)
    {
        abort_unless($r->user()->can('orders.view') && $r->user()->can('orders.manage'), 403);
        $d = $r->validate(['tenant_id' => ['prohibited'], 'branch_id' => ['required', 'integer', 'min:1'], 'currency' => ['required', 'in:COP,USD,EUR'], 'product_subtotal' => ['required', ...Money::rules()], ...self::feeRules(), ...($r->has('items') ? OrderLineRules::rules() : [])]);

        return DB::transaction(function () use ($r, $d, $plan) {
            Tenant::whereKey($r->user()->tenant_id)->lockForUpdate()->firstOrFail();
            $branch = Branch::findOrFail($d['branch_id']);
            abort_unless($branch->is_active && $r->user()->tenant()->value('currency') === $d['currency'], 409, 'Revisa sucursal y moneda.');

            return ['data' => $plan->calculate($r->user(), $d)];
        });
    }
}
