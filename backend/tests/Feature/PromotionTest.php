<?php

namespace Tests\Feature;

use App\Domains\Catalog\CatalogPricing;
use App\Domains\Catalog\PromotionResolver;
use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\ProductVariant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class PromotionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private array $product;

    private int $branch;

    private string $path;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'promotion@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($this->owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Carta', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $this->product = $this->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $category, 'sale_price' => '100.0050', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->branch = app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $this->path = '/api/v1/products/'.$this->product['id'];
    }

    private function context(): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'product_revision' => (int) DB::table('products')->where('id', $this->product['id'])->value('revision'), 'currency' => 'COP', 'expected_timezone' => 'America/Bogota'];
    }

    private function payload(array $changes = []): array
    {
        return [...$this->context(), 'variant_id' => null, 'branch_id' => null, 'channel' => 'all', 'name' => 'Oferta', 'discount_type' => 'percentage', 'discount_value' => '10', 'priority' => 0, 'valid_from' => null, 'valid_until' => null, 'is_active' => true, ...$changes];
    }

    private function promotion(array $changes = []): array
    {
        return $this->postJson($this->path.'/promotions', $this->payload($changes))->assertCreated()->json('data');
    }

    private function update(array $promotion, array $changes = []): array
    {
        return [...$this->context(), ...array_intersect_key($promotion, array_flip(['name', 'discount_type', 'priority', 'valid_from', 'valid_until', 'is_active', 'revision'])), 'discount_value' => $promotion['discount_type'] === 'percentage' ? rtrim(rtrim($promotion['discount_value'], '0'), '.') : $promotion['discount_value'], ...$changes];
    }

    private function price(string $channel = 'takeaway', ?int $variantId = null): array
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, function () use ($channel, $variantId) {
            $service = app(CatalogPricing::class);

            return $service->resolve(Product::findOrFail($this->product['id']), $variantId ? ProductVariant::findOrFail($variantId) : null, Branch::findOrFail($this->branch), $channel, $service->candidates([$this->product['id']], $variantId ? [$variantId] : [], $this->branch, $channel, 'America/Bogota'));
        });
    }

    private function input(): array
    {
        return ['branch_id' => $this->branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $this->product['id'], 'quantity' => 2, 'notes' => 'Conservar']]];
    }

    private function confirm(array $input): array
    {
        $preview = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->json('data.items.0');
        $line = array_intersect_key($preview, array_flip(['product_id', 'variant_id', 'quantity', 'product_revision', 'expected_unit_price', 'expected_tax_revision', 'modifiers', 'notes']));

        return [...$input, 'idempotency_key' => (string) Str::uuid(), 'items' => [$line]];
    }

    public function test_context_specificity_then_priority_and_oldest_rule_choose_only_one_discount(): void
    {
        $general = $this->promotion();
        $channel = $this->promotion(['channel' => 'takeaway', 'discount_type' => 'fixed', 'discount_value' => '3']);
        $branch = $this->promotion(['branch_id' => $this->branch, 'discount_type' => 'fixed', 'discount_value' => '2', 'priority' => 999]);
        $this->assertSame($branch['id'], $this->price()['promotion']['id']);
        $exact = $this->promotion(['branch_id' => $this->branch, 'channel' => 'takeaway', 'discount_type' => 'fixed', 'discount_value' => '1', 'priority' => 500]);
        $this->postJson($this->path.'/context-prices', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 5, 'currency' => 'COP', 'branch_id' => $this->branch, 'channel' => 'takeaway', 'amount' => '80.0001', 'is_active' => true])->assertCreated();
        $this->assertSame('79.0001', $this->price()['amount']);
        $this->assertSame('80.0001', $this->price()['base_amount']);
        $this->promotion(['branch_id' => $this->branch, 'channel' => 'takeaway', 'discount_value' => '99', 'priority' => 500]);
        $this->assertSame($exact['id'], $this->price()['promotion']['id']);
        $better = $this->promotion(['branch_id' => $this->branch, 'channel' => 'takeaway', 'discount_value' => '50', 'priority' => 499]);
        $this->assertSame('40.0000', $this->price()['amount']);
        $this->assertSame($better['id'], $this->price()['promotion']['id']);
        $this->assertSame($branch['id'], $this->price('dine_in')['promotion']['id']);
        $this->getJson('/api/v1/products?branch_id='.$this->branch.'&channel=takeaway')->assertJsonPath('data.0.price_context.amount', '40.0000')->assertJsonPath('data.0.sale_price', '100.0050');
        $this->putJson($this->path.'/promotions/'.$better['id'], $this->update($better, ['is_active' => false]))->assertOk();
        $this->assertSame($exact['id'], $this->price()['promotion']['id']);
        $this->assertNotSame($general['id'], $channel['id']);
    }

    public function test_percentage_half_up_discount_and_fixed_cap_never_create_negative_or_overflow(): void
    {
        $resolver = app(PromotionResolver::class);
        $rule = new ProductPromotion(['discount_type' => 'percentage', 'discount_value' => '50', 'priority' => 0, 'is_active' => true]);
        $rule->forceFill(['id' => 1, 'product_id' => 1, 'variant_id' => null, 'branch_id' => null, 'channel' => 'all', 'revision' => 1]);
        foreach (['0.0000' => '0.0000', '0.0001' => '0.0000', '0.0003' => '0.0001', '100.0050' => '50.0025', '999999999999999.9999' => '499999999999999.9999'] as $base => $expected) {
            $context = ['version' => 1, 'amount' => $base, 'variant_id' => null, 'branch_id' => 1, 'channel' => 'takeaway'];
            $result = $resolver->apply($context, 1, collect([$rule]), CarbonImmutable::parse('2026-11-18T12:00:00Z'), 'America/Bogota');
            $this->assertSame($expected, $result['amount']);
            $this->assertSame($base, bcadd($result['amount'], $result['promotion']['discount_amount'], 4));
        }
        $promotion = $this->promotion(['discount_type' => 'fixed', 'discount_value' => '999999999999999.9999']);
        $this->assertSame('0.0000', $this->price()['amount']);
        $this->assertSame('100.0050', $this->price()['promotion']['discount_amount']);
        $this->putJson($this->path.'/promotions/'.$promotion['id'], $this->update($promotion, ['discount_type' => 'percentage', 'discount_value' => '100']))->assertOk();
        $this->assertSame('0.0000', $this->price()['amount']);
    }

    public function test_validation_revisions_identity_timezone_uuid_and_archival_are_atomic(): void
    {
        foreach ([['discount_value' => '100.01'], ['discount_value' => '1.001'], ['discount_value' => 10], ['discount_type' => 'fixed', 'discount_value' => '-1'], ['valid_from' => '2026-12-01', 'valid_until' => '2026-11-30']] as $changes) {
            $this->postJson($this->path.'/promotions', $this->payload($changes))->assertUnprocessable();
        }
        $body = $this->payload();
        $promotion = $this->postJson($this->path.'/promotions', $body)->assertCreated()->json('data');
        $this->postJson($this->path.'/promotions', $body)->assertCreated()->assertJsonPath('data.id', $promotion['id']);
        $this->postJson($this->path.'/promotions', [...$body, 'name' => 'Otro'])->assertConflict();
        $this->postJson($this->path.'/promotions', $this->payload(['product_revision' => 1]))->assertConflict();
        $this->postJson($this->path.'/promotions', $this->payload(['currency' => 'USD']))->assertConflict();
        $this->postJson($this->path.'/promotions', $this->payload(['expected_timezone' => 'UTC']))->assertConflict();
        $update = $this->update($promotion, ['is_active' => false]);
        $this->putJson($this->path.'/promotions/'.$promotion['id'], [...$update, 'branch_id' => $this->branch])->assertUnprocessable();
        $this->putJson($this->path.'/promotions/'.$promotion['id'], $update)->assertOk();
        $this->putJson($this->path.'/promotions/'.$promotion['id'], $update)->assertOk()->assertJsonPath('data.revision', 2);
        $this->getJson($this->path.'/promotions?status=inactive&per_page=1')->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1);
        $this->assertSame(1, $this->price()['version']);
        $this->assertDatabaseCount('product_promotions', 1);
    }

    public function test_local_dates_include_last_day_and_expiration_between_preview_and_create_conflicts(): void
    {
        $this->promotion(['discount_value' => '50', 'valid_from' => '2026-11-18', 'valid_until' => '2026-11-18']);
        CarbonImmutable::setTestNow('2026-11-19T04:59:59Z');
        try {
            $this->assertSame('2026-11-18', $this->price()['promotion']['local_date']);
            $body = $this->confirm($this->input());
            CarbonImmutable::setTestNow('2026-11-19T05:00:00Z');
            $this->assertSame('100.0050', $this->price()['amount']);
            $this->postJson('/api/v1/orders', $body)->assertConflict();
            $this->assertDatabaseCount('orders', 0);
            CarbonImmutable::setTestNow('2026-11-18T05:00:00Z');
            $this->assertSame('50.0025', $this->price()['amount']);
            CarbonImmutable::setTestNow('2026-11-18T04:59:59Z');
            $this->assertSame('100.0050', $this->price()['amount']);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_variant_has_own_promotion_and_parent_rule_is_not_inherited(): void
    {
        $this->promotion(['discount_value' => '99']);
        $variant = $this->postJson($this->path.'/variants', ['product_revision' => 2, 'currency' => 'COP', 'name' => 'Grande', 'sku' => 'PIZZA-G', 'sale_price' => '20.0001', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->assertSame('20.0001', $this->price(variantId: $variant['id'])['amount']);
        $this->postJson($this->path.'/promotions', $this->payload())->assertUnprocessable();
        $this->promotion(['variant_id' => $variant['id'], 'discount_type' => 'fixed', 'discount_value' => '0.0001']);
        $this->assertSame('20.0000', $this->price(variantId: $variant['id'])['amount']);
        $this->getJson($this->path.'/variants?branch_id='.$this->branch.'&channel=takeaway')->assertJsonPath('data.0.price_context.amount', '20.0000');
        $this->getJson($this->path.'/promotions?variant_id='.$variant['id'])->assertJsonCount(1, 'data');
    }

    public function test_combo_promotes_root_once_and_keeps_individual_leaf_references_undiscounted(): void
    {
        $this->promotion(['discount_value' => '99']);
        $root = $this->postJson('/api/v1/products', ['kind' => 'combo', 'category_id' => $this->product['category_id'], 'name' => 'Combo', 'sku' => 'COMBO', 'sale_price' => '10.0001', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $path = '/api/v1/products/'.$root['id'];
        $this->putJson($path.'/combo-settings', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'currency' => 'COP', 'allocation_mode' => 'proportional'])->assertOk();
        $component = $this->postJson($path.'/combo-components', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'currency' => 'COP', 'component_product_id' => $this->product['id'], 'component_product_revision' => 2, 'units' => 2, 'position' => 0, 'is_active' => true])->assertCreated()->json('data');
        $this->postJson($path.'/promotions', [...$this->payload(['discount_value' => '50']), 'product_revision' => 3])->assertCreated();
        $input = [...$this->input(), 'items' => [['product_id' => $root['id'], 'kind' => 'combo', 'quantity' => 1, 'components' => [['component_id' => $component['id'], 'unit_index' => 0], ['component_id' => $component['id'], 'unit_index' => 1]]]]];
        $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonPath('data.subtotal', '5.0000')->assertJsonPath('data.items.0.price_context.promotion.discount_amount', '5.0001')->assertJsonPath('data.items.0.components.0.price_context.amount', '100.0050')->assertJsonMissingPath('data.items.0.components.0.price_context.promotion');
        $this->getJson($path.'/combo-configuration?branch_id='.$this->branch.'&channel=takeaway')->assertJsonPath('price_context.amount', '5.0000')->assertJsonPath('data.0.product.price_context.amount', '100.0050');
    }

    public function test_limits_permissions_audit_and_foreign_scope_bindings_do_not_leak_or_partially_write(): void
    {
        $first = $this->promotion();
        for ($index = 1; $index < 20; $index++) {
            $this->promotion(['name' => 'Oferta '.$index]);
        }
        $this->postJson($this->path.'/promotions', $this->payload())->assertUnprocessable();
        $this->getJson($this->path.'/promotions?per_page=10&page=2')->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 20);
        $this->putJson($this->path.'/promotions/'.$first['id'], $this->update($first, ['is_active' => false]))->assertOk();
        $this->promotion();
        $this->assertDatabaseCount('product_promotions', 21);
        $this->putJson($this->path.'/promotions/'.$first['id'], $this->update([...$first, 'revision' => 2], ['is_active' => false]))->assertOk();
        $before = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'catalog.promotion.updated') {
                throw new \RuntimeException('Auditoría requerida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->putJson($this->path.'/promotions/'.$first['id'], $this->update([...$first, 'revision' => 3], ['is_active' => false]));
            $this->fail('Debe revertirse.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría requerida', $error->getMessage());
        }
        $this->assertDatabaseCount('idempotency_records', $before);
        $this->assertDatabaseHas('product_promotions', ['id' => $first['id'], 'revision' => 3]);
        $this->withExceptionHandling();
        $other = app(RegisterCompany::class)->execute(['company_name' => 'Otra', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Eva', 'email' => 'foreign-promotion@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($other);
        $this->getJson($this->path.'/promotions')->assertNotFound();
        $this->actingAs($this->owner);
        $foreignBranch = app(TenantContext::class)->run($other->tenant_id, fn () => Branch::firstOrFail()->id);
        $this->postJson($this->path.'/promotions', $this->payload(['branch_id' => $foreignBranch]))->assertUnprocessable();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'catalog.manage')->value('id'))->delete();
        $this->actingAs($this->owner->fresh());
        $this->postJson($this->path.'/promotions', $this->payload())->assertForbidden();
    }

    public function test_discounted_base_addons_tax_manual_discount_split_payments_and_refund_remain_historical(): void
    {
        $promotion = $this->promotion(['discount_value' => '50']);
        $profile = $this->postJson('/api/v1/tax-profiles', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Incluido', 'price_mode' => 'inclusive', 'rates' => [['name' => 'Tasa ficticia', 'rate' => '10']], 'is_active' => true])->assertCreated()->json('data');
        DB::table('products')->where('id', $this->product['id'])->update(['tax_profile_id' => $profile['id']]);
        $group = $this->postJson($this->path.'/modifier-groups', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'currency' => 'COP', 'name' => 'Extras', 'kind' => 'addon', 'min_select' => 0, 'max_select' => 1, 'is_active' => true, 'options' => [['name' => 'Salsa', 'extra_price' => '0.5050', 'is_active' => true]]])->assertCreated()->json('data');
        $option = $this->getJson($this->path.'/modifier-configuration')->json('data.0.options.0.id');
        $input = $this->input();
        $input['items'][0]['modifiers'] = [['group_id' => $group['id'], 'option_ids' => [$option]]];
        $body = $this->confirm($input);
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.subtotal', '101.0150')->assertJsonPath('data.items.0.base_unit_price', '50.0025')->assertJsonPath('data.items.0.unit_price', '50.5075')->assertJsonPath('data.items.0.price_snapshot.promotion.id', $promotion['id'])->json('data');
        $this->putJson($this->path.'/promotions/'.$promotion['id'], $this->update($promotion, ['name' => 'Archivada', 'is_active' => false]))->assertOk();
        DB::table('tax_profiles')->where('id', $profile['id'])->update(['is_active' => false, 'revision' => 2]);
        DB::table('products')->where('id', $this->product['id'])->update(['availability_schedule_enabled' => true]);
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.items.0.price_snapshot.promotion.name', 'Oferta');
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'product', 'tax_name' => 'Por producto', 'tax_rate' => '0', 'tip_enabled' => false])->assertOk();
        $this->getJson('/api/v1/orders/'.$order['id'].'/quote?discount_amount=1.02&split_count=2')->assertOk()->assertJsonPath('data.total', '100.0000')->assertJsonPath('data.tax_amount', '9.0900')->assertJsonPath('data.taxable_base', '90.9100');
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'order_revision' => 1, 'settings_revision' => 2, 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'discount_amount' => '1.02', 'discount_reason' => 'Ajuste manual separado', 'expected_total' => '100', 'received_amount' => '25', 'payment_amount' => '20', 'split_count' => 2, 'account_number' => 1])->assertCreated()->assertJsonPath('data.balance_due', '80.0000')->json('data');
        $cash = $this->getJson('/api/v1/payment-methods')->json('data.0.id');
        $payment = ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 2, 'expected_balance' => '80', 'cash_session_id' => $session['id'], 'cash_revision' => 2, 'payments' => [
            ['account_id' => $sale['accounts'][0]['id'], 'payment_method_id' => $cash, 'method_revision' => 1, 'amount' => '30', 'received_amount' => '30'],
            ['account_id' => $sale['accounts'][1]['id'], 'payment_method_id' => $cash, 'method_revision' => 1, 'amount' => '50', 'received_amount' => '50']]];
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $payment)->assertOk()->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.paid_amount', '100.0000');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $payment)->assertOk();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refunds', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 3, 'expected_refundable' => '100', 'cash_session_id' => $session['id'], 'cash_revision' => 4, 'reason' => 'Compensación parcial', 'refunds' => [['payment_id' => $sale['payments'][0]['id'], 'amount' => '10']]])->assertOk()->assertJsonPath('data.balance_due', '0.0000');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 4, 'cash_session_id' => $session['id'], 'cash_revision' => 5, 'reason' => 'Compensar remanente histórico'])->assertOk()->assertJsonPath('data.net_paid_amount', '0.0000')->assertJsonPath('data.items.0.price_snapshot.promotion.name', 'Oferta');
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertJsonPath('data.expected_amount', '1000.0000');
        $this->assertDatabaseCount('payments', 3);
        $this->assertDatabaseCount('orders', 1);
    }

    public function test_reader_cannot_write_and_revoked_permission_is_checked_before_registered_replay(): void
    {
        $body = $this->payload();
        $promotion = $this->postJson($this->path.'/promotions', $body)->assertCreated()->json('data');
        $role = DB::table('roles')->where('tenant_id', $this->owner->tenant_id)->where('name', 'Cajero')->first();
        DB::table('role_permission')->insert(['tenant_id' => $this->owner->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'catalog.view')->value('id')]);
        $this->actingAs(User::factory()->create(['tenant_id' => $this->owner->tenant_id, 'role_id' => $role->id]));
        $this->getJson($this->path.'/promotions')->assertOk()->assertJsonMissingPath('data.0.tenant_id')->assertJsonMissingPath('data.0.variant.cost_price');
        $this->getJson('/api/v1/products?branch_id='.$this->branch.'&channel=takeaway')->assertOk()->assertJsonMissingPath('data.0.cost_price')->assertJsonPath('data.0.price_context.promotion.id', $promotion['id']);
        $this->postJson($this->path.'/promotions', $body)->assertForbidden();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'catalog.manage')->value('id'))->delete();
        $this->actingAs($this->owner->fresh());
        $this->postJson($this->path.'/promotions', $body)->assertForbidden();
        $this->assertDatabaseCount('product_promotions', 1);
    }

    public function test_raw_fk_cannot_link_promotion_to_variant_of_another_product(): void
    {
        $other = $this->postJson('/api/v1/products', ['category_id' => $this->product['category_id'], 'name' => 'Otra', 'sku' => 'OTRA', 'sale_price' => '1', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $variant = $this->postJson('/api/v1/products/'.$other['id'].'/variants', ['product_revision' => 1, 'currency' => 'COP', 'name' => 'Grande', 'sku' => 'OTRA-G', 'sale_price' => '1', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->expectException(QueryException::class);
        DB::table('product_promotions')->insert(['tenant_id' => $this->owner->tenant_id, 'product_id' => $this->product['id'], 'variant_id' => $variant['id'], 'name' => 'Ajena', 'channel' => 'all', 'discount_type' => 'fixed', 'discount_value' => '1']);
    }
}
