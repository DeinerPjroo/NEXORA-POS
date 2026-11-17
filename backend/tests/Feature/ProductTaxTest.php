<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Sales\CentAllocation;
use App\Domains\Sales\ProductTaxTotals;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ProductTaxTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function profileData(string $name = 'Perfil adicional', array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'name' => $name, 'price_mode' => 'exclusive', 'is_active' => true,
            'rates' => [['name' => 'Tasa A', 'rate' => '8'], ['name' => 'Tasa B', 'rate' => '2']], ...$extra];
    }

    private function work(string $email = 'product-tax@example.test'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        $exclusive = $this->postJson('/api/v1/tax-profiles', $this->profileData())->assertCreated()->json('data');
        $inclusive = $this->postJson('/api/v1/tax-profiles', $this->profileData('Perfil incluido', ['price_mode' => 'inclusive']))->assertCreated()->json('data');
        [$branch, $products] = app(TenantContext::class)->run($owner->tenant_id, function () use ($exclusive, $inclusive) {
            $category = Category::create(['name' => 'Menú', 'color' => '#8271FF']);
            $products = [];
            foreach ([['100.0050', $exclusive['id']], ['110.0050', $inclusive['id']], ['10.0050', null]] as $index => [$price, $profileId]) {
                $products[] = Product::create(['name' => 'Menú '.($index + 1), 'sku' => 'MENU-'.($index + 1), 'category_id' => $category->id, 'tax_profile_id' => $profileId, 'sale_price' => $price, 'is_active' => true, 'is_available' => true]);
            }

            return [Branch::firstOrFail()->id, $products];
        });
        $orderData = ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => array_map(fn ($p) => ['product_id' => $p->id, 'quantity' => 1, 'product_revision' => 1, 'expected_unit_price' => $p->sale_price, ...($p->tax_profile_id ? ['expected_tax_revision' => 1] : [])], $products)];
        $order = $this->postJson('/api/v1/orders', $orderData)->assertCreated()->json('data');
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');

        return compact('owner', 'exclusive', 'inclusive', 'branch', 'products', 'order', 'orderData', 'session');
    }

    private function settings(array $extra = []): array
    {
        return ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'product', 'tax_name' => 'Por producto', 'tax_rate' => '0', 'tip_enabled' => false, ...$extra];
    }

    private function quote(array $work, string $extra = '')
    {
        return $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_amount=22'.$extra);
    }

    private function collectData(array $work, array $extra = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 1, 'order_revision' => 1, 'settings_revision' => 2, 'discount_amount' => '22', 'discount_reason' => 'Beneficio autorizado', 'expected_total' => '207.02', 'received_amount' => '210', ...$extra];
    }

    private function updateProfile(array $profile, array $extra = [])
    {
        return $this->putJson('/api/v1/tax-profiles/'.$profile['id'], ['revision' => $profile['revision'], 'name' => $profile['name'], 'price_mode' => $profile['price_mode'], 'rates' => $profile['rates'], 'is_active' => $profile['is_active'], ...$extra]);
    }

    public function test_mixed_profiles_distribute_subtotals_discount_and_taxes_without_adding_included_tax_twice(): void
    {
        $work = $this->work();
        $this->putJson('/api/v1/sales/settings', $this->settings())->assertOk();
        $this->quote($work)->assertOk()->assertJsonPath('data.calculation_version', 3)->assertJsonPath('data.catalog_subtotal', '220.0150')->assertJsonPath('data.subtotal', '220.0200')->assertJsonPath('data.taxable_base', '189.0200')
            ->assertJsonPath('data.tax_amount', '18.0000')->assertJsonPath('data.total', '207.0200')->assertJsonPath('data.tax_breakdown.included_tax_amount', '9.0000')->assertJsonPath('data.tax_breakdown.additional_tax_amount', '9.0000')
            ->assertJsonPath('data.tax_breakdown.items.0.subtotal', '100.0100')->assertJsonPath('data.tax_breakdown.items.1.subtotal', '110.0100')->assertJsonPath('data.tax_breakdown.items.2.subtotal', '10.0000')
            ->assertJsonPath('data.tax_breakdown.items.0.discount_amount', '10.0000')->assertJsonPath('data.tax_breakdown.items.1.discount_amount', '11.0000')->assertJsonPath('data.tax_breakdown.items.2.discount_amount', '1.0000')
            ->assertJsonPath('data.tax_breakdown.items.0.taxes.0.amount', '7.2000')->assertJsonPath('data.tax_breakdown.items.1.taxes.1.amount', '1.8000');
        $data = $this->collectData($work);
        $path = '/api/v1/orders/'.$work['order']['id'].'/collect';
        $this->postJson($path, $data)->assertCreated()->assertJsonPath('data.total', '207.0200')->assertJsonPath('data.calculation_version', 3)->assertJsonPath('data.payment.change_amount', '2.9800');
        $this->postJson($path, $data)->assertCreated();
        $this->assertDatabaseCount('sales', 1);
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1207.0200');
    }

    public function test_profile_replay_revision_archival_and_pagination_preserve_order_snapshots(): void
    {
        $work = $this->work();
        $data = $this->profileData('Otro perfil');
        $profile = $this->postJson('/api/v1/tax-profiles', $data)->assertCreated()->assertJsonMissingPath('data.tenant_id')->json('data');
        $this->postJson('/api/v1/tax-profiles', $data)->assertCreated();
        $this->assertDatabaseCount('tax_profiles', 3);
        $this->postJson('/api/v1/tax-profiles', [...$data, 'idempotency_key' => (string) Str::uuid()])->assertUnprocessable();
        $this->updateProfile($work['exclusive'], ['is_active' => false, 'rates' => [['name' => 'Otra tasa', 'rate' => '100']]])->assertOk()->assertJsonPath('data.revision', 2);
        $this->updateProfile($work['exclusive'])->assertConflict();
        $this->getJson('/api/v1/tax-profiles?status=inactive&per_page=1')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/tax-profiles?status=active&search=')->assertOk();
        $this->putJson('/api/v1/sales/settings', $this->settings())->assertOk();
        $this->quote($work)->assertOk()->assertJsonPath('data.total', '207.0200')->assertJsonPath('data.tax_breakdown.items.0.profile.revision', 1);
        $this->getJson('/api/v1/products/'.$work['products'][0]->id)->assertJsonPath('data.sellable', false);
        $this->postJson('/api/v1/orders', [...$work['orderData'], 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $this->getJson('/api/v1/orders/'.$work['order']['id'])->assertJsonPath('data.items.0.tax_snapshot.rates.0.rate', '8.0000');
        $this->assertSame(1, $profile['revision']);
    }

    public function test_profile_change_is_checked_even_when_product_price_and_revision_are_unchanged(): void
    {
        $work = $this->work();
        $this->updateProfile($work['exclusive'], ['name' => 'Nueva versión'])->assertOk();
        $this->postJson('/api/v1/orders', [...$work['orderData'], 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $this->assertDatabaseCount('orders', 1);
        $data = $work['orderData'];
        $data['items'][0]['expected_tax_revision'] = 2;
        $data['idempotency_key'] = (string) Str::uuid();
        $this->postJson('/api/v1/orders', $data)->assertCreated()->assertJsonPath('data.items.0.tax_snapshot.name', 'Nueva versión');
    }

    public function test_product_assignment_requires_current_profile_revision_and_omission_preserves_assignment(): void
    {
        $work = $this->work();
        $p = $work['products'][0];
        $data = ['revision' => 1, 'name' => $p->name, 'sku' => $p->sku, 'category_id' => $p->category_id, 'sale_price' => $p->sale_price, 'currency' => 'COP', 'is_active' => true, 'is_available' => true];
        $this->putJson('/api/v1/products/'.$p->id, [...$data, 'tax_profile_id' => $work['inclusive']['id'], 'tax_profile_revision' => 99])->assertConflict();
        $this->putJson('/api/v1/products/'.$p->id, $data)->assertOk()->assertJsonPath('data.tax_profile.id', $work['exclusive']['id'])->assertJsonPath('data.revision', 2);
        $this->putJson('/api/v1/products/'.$p->id, [...$data, 'revision' => 2, 'tax_profile_id' => $work['inclusive']['id'], 'tax_profile_revision' => 1])->assertOk()->assertJsonPath('data.tax_profile.id', $work['inclusive']['id']);
    }

    public function test_tip_participation_requires_explicit_profile_and_freezes_its_confirmed_policy(): void
    {
        $work = $this->work();
        $tip = ['tip_enabled' => true, 'tip_tax_mode' => 'included'];
        $this->putJson('/api/v1/sales/settings', $this->settings($tip))->assertUnprocessable();
        $tip += ['tip_tax_profile_id' => $work['exclusive']['id'], 'tip_tax_profile_revision' => 1];
        $this->putJson('/api/v1/sales/settings', $this->settings($tip))->assertOk()->assertJsonPath('data.tip_tax_snapshot.revision', 1);
        $this->quote($work, '&tip_amount=0')->assertOk()->assertJsonPath('data.tax_breakdown.tip', null);
        $this->quote($work, '&tip_amount=5.25')->assertOk()->assertJsonPath('data.total', '212.8000')->assertJsonPath('data.tax_breakdown.tip.additional_tax_amount', '0.5300');
        $this->updateProfile($work['exclusive'], ['rates' => [['name' => 'Otra tasa', 'rate' => '100']]])->assertOk();
        $this->quote($work, '&tip_amount=5.25')->assertOk()->assertJsonPath('data.total', '212.8000');
        $this->putJson('/api/v1/sales/settings', $this->settings(['revision' => 2, ...$tip, 'tip_tax_profile_id' => $work['inclusive']['id']]))->assertOk();
        $this->quote($work, '&tip_amount=5.25')->assertOk()->assertJsonPath('data.total', '212.2700')->assertJsonPath('data.tax_breakdown.tip.included_tax_amount', '0.4800');
        $this->putJson('/api/v1/sales/settings', $this->settings(['revision' => 3, ...$tip, 'tip_tax_profile_id' => null]))->assertUnprocessable();
    }

    public function test_product_mode_does_not_guess_tax_for_legacy_unpaid_orders(): void
    {
        $work = $this->work();
        DB::table('order_items')->where('order_id', $work['order']['id'])->update(['tax_snapshot' => null]);
        $this->putJson('/api/v1/sales/settings', $this->settings())->assertConflict();
        $this->putJson('/api/v1/sales/settings', $this->settings(['tax_mode' => 'none']))->assertOk();
        $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->collectData($work, ['discount_amount' => '0', 'expected_total' => '220.02', 'received_amount' => '230']))->assertCreated()->assertJsonPath('data.calculation_version', 1);
        $this->putJson('/api/v1/sales/settings', $this->settings(['revision' => 2]))->assertOk();
    }

    public function test_zero_rates_and_full_discount_keep_components_and_totals_exact(): void
    {
        $work = $this->work();
        $zero = $this->postJson('/api/v1/tax-profiles', $this->profileData('Cero incluido', ['price_mode' => 'inclusive', 'rates' => [['name' => 'Cero', 'rate' => '0']]]))->assertCreated()->json('data');
        $this->putJson('/api/v1/sales/settings', $this->settings(['tip_enabled' => true, 'tip_tax_mode' => 'included', 'tip_tax_profile_id' => $zero['id'], 'tip_tax_profile_revision' => 1]))->assertOk();
        $this->getJson('/api/v1/orders/'.$work['order']['id'].'/quote?discount_type=percentage&discount_value=100&tip_amount=0.01')->assertOk()->assertJsonPath('data.total', '0.0100')->assertJsonPath('data.tax_amount', '0.0000')->assertJsonPath('data.tax_breakdown.tip.base', '0.0100');
    }

    public function test_financial_snapshot_survives_split_payments_and_refund_after_profiles_change(): void
    {
        $work = $this->work();
        $this->putJson('/api/v1/sales/settings', $this->settings())->assertOk();
        $sale = $this->postJson('/api/v1/orders/'.$work['order']['id'].'/collect', $this->collectData($work, ['split_count' => 2, 'account_number' => 1, 'payment_amount' => '10', 'received_amount' => '20']))->assertCreated()->assertJsonPath('data.accounts.0.amount', '103.5100')->json('data');
        $this->updateProfile($work['inclusive'], ['is_active' => false])->assertOk();
        $cash = $this->getJson('/api/v1/payment-methods')->json('data.0');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 2, 'sale_revision' => 2, 'expected_balance' => '197.02', 'payments' => [['account_id' => $sale['accounts'][0]['id'], 'payment_method_id' => $cash['id'], 'method_revision' => 1, 'amount' => '93.51', 'received_amount' => '100']]])->assertOk()->assertJsonPath('data.total', '207.0200')->assertJsonPath('data.tax_breakdown.included_tax_amount', '9.0000');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'cash_session_id' => $work['session']['id'], 'cash_revision' => 3, 'sale_revision' => 3, 'reason' => 'Cerrar venta por producto'])->assertOk()->assertJsonPath('data.calculation_version', 3)->assertJsonPath('data.tax_amount', '18.0000')->assertJsonPath('data.cancelled_balance', '103.5100');
        $this->getJson('/api/v1/cash/sessions/'.$work['session']['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }

    public function test_profile_and_assignment_cannot_cross_tenant_and_permissions_are_checked(): void
    {
        $first = $this->work();
        $second = $this->work('other-product-tax@example.test');
        $this->updateProfile($first['exclusive'])->assertNotFound();
        $this->getJson('/api/v1/tax-profiles?status=all')->assertOk()->assertJsonCount(2, 'data');
        $role = DB::table('roles')->where('tenant_id', $second['owner']->tenant_id)->where('name', 'Cajero')->first();
        $this->actingAs(User::factory()->create(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id]));
        $this->postJson('/api/v1/tax-profiles', $this->profileData('No autorizado'))->assertForbidden();
        $this->actingAs($second['owner']);
        $this->expectException(QueryException::class);
        DB::table('products')->where('id', $second['products'][0]->id)->update(['tax_profile_id' => $first['exclusive']['id']]);
    }

    public function test_invalid_profiles_reject_ambiguous_lists_rates_and_extra_keys(): void
    {
        $this->work();
        foreach ([[], ['key' => ['name' => 'Tasa', 'rate' => '1']], [['name' => 'Tasa', 'rate' => 8]], [['name' => 'Tasa', 'rate' => '1e1']], [['name' => 'Tasa', 'rate' => '100.0001']], [['name' => 'Tasa', 'rate' => '1', 'formula' => 'script']], [['name' => 'Tasa', 'rate' => '1'], ['name' => 'tasa', 'rate' => '2']]] as $rates) {
            $this->postJson('/api/v1/tax-profiles', $this->profileData('Inválido', ['rates' => $rates]))->assertUnprocessable();
        }
        $this->assertDatabaseCount('tax_profiles', 2);
    }

    public function test_profile_audit_failure_rolls_back_profile_and_idempotency_record(): void
    {
        $this->work();
        $records = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'sales.tax_profile.created') {
                throw new \RuntimeException('Fallo de auditoría de perfil');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson('/api/v1/tax-profiles', $this->profileData('Error transaccional'));
            $this->fail('El perfil y la auditoría deben confirmar juntos.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Fallo de auditoría de perfil', $error->getMessage());
        }
        $this->assertDatabaseCount('tax_profiles', 2);
        $this->assertDatabaseCount('idempotency_records', $records);
    }

    public function test_cent_allocation_has_exact_sums_stable_ties_zero_weights_and_extreme_precision(): void
    {
        $this->assertSame(['1', '1', '0'], CentAllocation::distribute('2', ['1', '1', '1']));
        $this->assertSame(['0', '3', '0'], CentAllocation::distribute('3', ['0', '2', '0']));
        $this->assertSame(['0', '0'], CentAllocation::distribute('0', ['0', '0']));
        $parts = CentAllocation::distribute('99999999999999999', ['9999999999999999999', '9999999999999999998', '1']);
        $this->assertSame('99999999999999999', array_reduce($parts, fn ($sum, $part) => bcadd($sum, $part, 0), '0'));
        $this->assertSame('50000000000000000', $parts[0]);
        $this->assertSame('0', $parts[2]);
    }

    private function extremeOrder(string $mode): Order
    {
        $profile = ['profile_id' => 1, 'name' => 'Perfil extremo de prueba', 'revision' => 1, 'price_mode' => $mode,
            'rates' => array_map(fn ($index) => ['name' => 'Tasa '.($index + 1), 'rate' => '100.0000'], range(0, 4))];
        $item = new OrderItem(['product_name' => 'Importe extremo', 'line_subtotal' => '999999999999999.9900', 'tax_snapshot' => $profile]);

        return (new Order)->setRelation('items', collect([$item]));
    }

    public function test_five_included_taxes_preserve_decimal_maximum_and_exact_component_sum(): void
    {
        $result = app(ProductTaxTotals::class)->calculate($this->extremeOrder('inclusive'), '999999999999999.9900', '0', '0', null);
        $this->assertSame('999999999999999.9900', $result['total']);
        $this->assertSame('166666666666666.6700', $result['base']);
        $this->assertSame('833333333333333.3200', $result['tax']);
        $this->assertSame($result['tax'], array_reduce($result['breakdown']['items'][0]['taxes'], fn ($sum, $tax) => bcadd($sum, $tax['amount'], 4), '0.0000'));
    }

    public function test_multiple_additional_taxes_reject_decimal_overflow(): void
    {
        $this->expectException(ValidationException::class);
        app(ProductTaxTotals::class)->calculate($this->extremeOrder('exclusive'), '999999999999999.9900', '0', '0', null);
    }
}
