<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\OrderCombo;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class FixedComboTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'combo@example.test', string $price = '10.0001'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Carta', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $base = ['category_id' => $category, 'currency' => 'COP', 'is_active' => true, 'is_available' => true];
        $leaf = $this->postJson('/api/v1/products', [...$base, 'name' => 'Pollo', 'sku' => 'POLLO', 'sale_price' => '2'])->assertCreated()->json('data');
        $other = $this->postJson('/api/v1/products', [...$base, 'name' => 'Bebida', 'sku' => 'BEBIDA', 'sale_price' => '1'])->assertCreated()->json('data');
        $root = $this->postJson('/api/v1/products', [...$base, 'kind' => 'combo', 'name' => 'Combo almuerzo', 'sku' => 'COMBO', 'sale_price' => $price])->assertCreated()->json('data');
        $branch = app(TenantContext::class)->run($owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $path = '/api/v1/products/'.$root['id'];

        return compact('owner', 'category', 'base', 'leaf', 'other', 'root', 'branch', 'path');
    }

    private function add(array $work, array $leaf, int $revision, int $units = 1): array
    {
        return $this->postJson($work['path'].'/combo-components', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => $revision, 'currency' => 'COP', 'component_product_id' => $leaf['id'], 'component_product_revision' => $leaf['revision'], 'units' => $units, 'position' => $revision, 'is_active' => true])->assertCreated()->json('data');
    }

    private function setupCombo(array $work, string $mode = 'proportional'): array
    {
        $first = $this->add($work, $work['leaf'], 1);
        $second = $this->add($work, $work['other'], 2);
        $this->putJson($work['path'].'/combo-settings', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 3, 'currency' => 'COP', 'allocation_mode' => $mode])->assertOk();

        return ['branch_id' => $work['branch'], 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['kind' => 'combo', 'product_id' => $work['root']['id'], 'quantity' => 2, 'notes' => 'Compartir', 'components' => [['component_id' => $first['id'], 'unit_index' => 0, 'notes' => 'Bien dorado'], ['component_id' => $second['id'], 'unit_index' => 0]]]]];
    }

    private function confirm(array $input, array $preview): array
    {
        $line = $preview['items'][0];
        $components = array_map(fn ($part) => array_intersect_key($part, array_flip(['component_id', 'unit_index', 'product_revision', 'expected_tax_revision', 'notes', 'modifiers'])), $line['components']);

        return [...$input, 'idempotency_key' => (string) Str::uuid(), 'items' => [[...$input['items'][0], 'product_revision' => $line['product_revision'], 'expected_unit_price' => $line['expected_unit_price'], 'components' => $components]]];
    }

    public function test_delivery_combo_removal_keeps_original_components_and_cancels_the_entire_header(): void
    {
        $work = $this->work();
        $input = [...$this->setupCombo($work), 'channel' => 'delivery'];
        $preview = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->json('data');
        $body = [...$this->confirm($input, $preview), 'delivery' => ['recipient_name' => 'Cliente', 'phone' => '3001234567', 'address' => 'Calle principal 123']];
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->json('data');
        $change = ['idempotency_key' => (string) Str::uuid(), 'order_revision' => 1, 'delivery_revision' => 1, 'item_id' => $order['items'][0]['id'], 'action' => 'correct', 'quantity' => 1, 'notes' => null, 'reason' => 'Cambio de combo'];
        $this->postJson('/api/v1/orders/'.$order['id'].'/item-changes', $change)->assertUnprocessable();
        unset($change['quantity'], $change['notes']);
        $change['action'] = 'cancel';
        $this->postJson('/api/v1/orders/'.$order['id'].'/item-changes', $change)->assertOk()->assertJsonCount(0, 'data.items')->assertJsonCount(0, 'data.combos')->assertJsonCount(count($order['items']), 'data.item_changes')->assertJsonPath('data.status', 'cancelled');
        $this->assertDatabaseCount('order_items', count($order['items']));
        $this->assertDatabaseCount('order_combos', 1);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_identity_configuration_nested_guard_and_menu_eligibility(): void
    {
        $work = $this->work();
        $this->getJson($work['path'])->assertJsonPath('data.kind', 'combo')->assertJsonPath('data.sellable', false);
        $input = $this->setupCombo($work);
        $this->getJson($work['path'])->assertJsonPath('data.sellable', true)->assertJsonPath('data.combo_context.expanded_units', 2);
        $this->getJson($work['path'].'/combo-configuration?branch_id='.$work['branch'].'&channel=takeaway')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.product.price_context.amount', '2.0000')->assertJsonPath('product_revision', 4);
        $this->getJson('/api/v1/products?kind=regular')->assertJsonCount(2, 'data');
        $this->putJson($work['path'], [...$work['base'], 'name' => 'Otro', 'sku' => 'COMBO', 'sale_price' => '10', 'revision' => 4, 'kind' => 'regular'])->assertUnprocessable();
        $this->postJson($work['path'].'/variants', ['product_revision' => 4, 'currency' => 'COP', 'name' => 'Grande', 'sku' => 'COMBO-G', 'sale_price' => '20', 'is_active' => true, 'is_available' => true])->assertUnprocessable();
        $this->postJson($work['path'].'/modifier-groups', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 4, 'currency' => 'COP', 'name' => 'Extras', 'kind' => 'addon', 'min_select' => 0, 'max_select' => 1, 'is_active' => true, 'options' => [['name' => 'Extra', 'extra_price' => '1', 'is_active' => true]]])->assertUnprocessable();
        $this->postJson($work['path'].'/combo-components', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 4, 'currency' => 'COP', 'component_product_id' => $work['root']['id'], 'component_product_revision' => 4, 'units' => 1, 'position' => 0, 'is_active' => true])->assertUnprocessable();
        $this->postJson('/api/v1/orders/preview', array_replace($input, ['items' => [['product_id' => $work['root']['id'], 'quantity' => 1]]]))->assertUnprocessable();
        DB::table('products')->where('id', $work['leaf']['id'])->update(['is_available' => false]);
        $this->getJson($work['path'])->assertJsonPath('data.sellable', false);
        $this->postJson('/api/v1/orders/preview', $input)->assertConflict();
    }

    public function test_preview_allocates_exact_four_decimals_and_stores_only_billable_components_with_header(): void
    {
        $work = $this->work();
        $input = $this->setupCombo($work);
        $before = DB::table('audit_logs')->count();
        $preview = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonPath('data.subtotal', '20.0002')->assertJsonPath('data.items.0.components.0.base_unit_price', '6.6667')->assertJsonPath('data.items.0.components.1.base_unit_price', '3.3334')->json('data');
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_combos', 0);
        $this->assertDatabaseCount('audit_logs', $before);
        $body = $this->confirm($input, $preview);
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonCount(2, 'data.items')->assertJsonCount(1, 'data.combos')->assertJsonPath('data.combos.0.unit_price', '10.0001')->assertJsonPath('data.items.0.unit_price', '6.6667')->assertJsonPath('data.items.1.line_subtotal', '6.6668')->json('data');
        $this->assertSame($order['combos'][0]['id'], $order['items'][0]['order_combo_id']);
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.id', $order['id']);
        $this->assertDatabaseCount('order_combos', 1);
        app(TenantContext::class)->run($work['owner']->tenant_id, function () {
            $this->expectException(\LogicException::class);
            OrderCombo::firstOrFail()->update(['unit_price' => '1']);
        });
    }

    public function test_equal_allocation_handles_repeated_units_and_zero_references_but_positive_proportional_requires_weights(): void
    {
        $work = $this->work(price: '0.0001');
        $first = $this->add($work, $work['leaf'], 1, 3);
        $this->putJson($work['path'].'/combo-settings', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'currency' => 'COP', 'allocation_mode' => 'equal'])->assertOk();
        $input = ['branch_id' => $work['branch'], 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['kind' => 'combo', 'product_id' => $work['root']['id'], 'quantity' => 999, 'components' => array_map(fn ($index) => ['component_id' => $first['id'], 'unit_index' => $index], [0, 1, 2])]]];
        $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonPath('data.subtotal', '0.0999')->assertJsonPath('data.items.0.components.0.base_unit_price', '0.0001')->assertJsonPath('data.items.0.components.1.base_unit_price', '0.0000');
        DB::table('products')->where('id', $work['leaf']['id'])->update(['sale_price' => '0']);
        DB::table('products')->where('id', $work['root']['id'])->update(['combo_allocation_mode' => 'proportional']);
        $this->postJson('/api/v1/orders/preview', $input)->assertConflict();
        DB::table('products')->where('id', $work['root']['id'])->update(['sale_price' => '0']);
        $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonPath('data.subtotal', '0.0000');
    }

    public function test_revision_forgery_duplicate_units_and_expansion_limit_leave_no_partial_order(): void
    {
        $work = $this->work();
        $input = $this->setupCombo($work);
        $preview = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->json('data');
        $body = $this->confirm($input, $preview);
        $body['items'][0]['components'][0]['product_revision'] = 99;
        $this->postJson('/api/v1/orders', $body)->assertConflict();
        $body = $this->confirm($input, $preview);
        $body['items'][0]['expected_unit_price'] = '1';
        $this->postJson('/api/v1/orders', $body)->assertConflict();
        $body = $input;
        $body['items'][0]['components'][1] = $body['items'][0]['components'][0];
        $this->postJson('/api/v1/orders/preview', $body)->assertUnprocessable();
        $body = $input;
        $body['items'][0]['components'][0]['expected_unit_price'] = '1';
        $this->postJson('/api/v1/orders/preview', $body)->assertUnprocessable();
        $body = $input;
        $body['items'] = array_fill(0, 51, $input['items'][0]);
        $this->postJson('/api/v1/orders/preview', $body)->assertUnprocessable();
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
        $this->assertDatabaseCount('order_combos', 0);
    }

    public function test_component_idempotency_scopes_archives_and_audit_rollback(): void
    {
        $work = $this->work();
        $component = $this->add($work, $work['leaf'], 1, 20);
        $body = ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'currency' => 'COP', 'component_product_id' => $work['other']['id'], 'component_product_revision' => 1, 'units' => 1, 'position' => 2, 'is_active' => true];
        $this->postJson($work['path'].'/combo-components', $body)->assertUnprocessable();
        $update = ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'currency' => 'COP', 'revision' => 1, 'units' => 20, 'position' => 0, 'is_active' => false];
        $this->putJson($work['path'].'/combo-components/'.$component['id'], $update)->assertOk();
        $this->putJson($work['path'].'/combo-components/'.$component['id'], $update)->assertOk()->assertJsonPath('data.revision', 2);
        $this->getJson($work['path'].'/combo-components?status=inactive')->assertJsonCount(1, 'data');
        $other = $this->work('other-combo@example.test');
        $this->getJson($work['path'].'/combo-components')->assertNotFound();
        $this->putJson($other['path'].'/combo-components/'.$component['id'], $update)->assertNotFound();
        $before = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'catalog.combo.component.created') {
                throw new \RuntimeException('Auditoría de combo fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->add($other, $other['leaf'], 1);
            $this->fail('Se requiere auditoría.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de combo fallida', $error->getMessage());
        }
        $this->assertDatabaseCount('product_combo_components', 1);
        $this->assertDatabaseCount('idempotency_records', $before);
    }

    public function test_component_profiles_addons_context_and_closed_schedule_preserve_financial_snapshots(): void
    {
        $work = $this->work();
        $input = $this->setupCombo($work, 'equal');
        $profiles = [];
        foreach (['inclusive' => '10', 'exclusive' => '20'] as $mode => $rate) {
            $profiles[] = $this->postJson('/api/v1/tax-profiles', ['idempotency_key' => (string) Str::uuid(), 'name' => $mode, 'price_mode' => $mode, 'rates' => [['name' => 'Tasa ficticia', 'rate' => $rate]], 'is_active' => true])->assertCreated()->json('data');
        }
        DB::table('products')->where('id', $work['leaf']['id'])->update(['tax_profile_id' => $profiles[0]['id']]);
        DB::table('products')->where('id', $work['other']['id'])->update(['tax_profile_id' => $profiles[1]['id']]);
        $group = $this->postJson('/api/v1/products/'.$work['leaf']['id'].'/modifier-groups', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'currency' => 'COP', 'name' => 'Extras', 'kind' => 'addon', 'min_select' => 0, 'max_select' => 1, 'is_active' => true, 'options' => [['name' => 'Salsa', 'extra_price' => '0.5050', 'is_active' => true]]])->assertCreated()->json('data');
        $option = $this->getJson('/api/v1/products/'.$work['leaf']['id'].'/modifier-configuration')->json('data.0.options.0.id');
        $input['items'][0]['components'][0]['modifiers'] = [['group_id' => $group['id'], 'option_ids' => [$option]]];
        $rule = $this->postJson($work['path'].'/context-prices', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 4, 'currency' => 'COP', 'branch_id' => $work['branch'], 'channel' => 'takeaway', 'amount' => '10.0001', 'is_active' => true])->assertCreated()->json('data');
        $preview = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonPath('data.subtotal', '21.0102')->json('data');
        $body = $this->confirm($input, $preview);
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.combos.0.snapshot.price_context.rule_id', $rule['id'])->assertJsonPath('data.items.0.modifiers_snapshot.0.options.0.name', 'Salsa')->json('data');
        $this->putJson($work['path'].'/context-prices/'.$rule['id'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 5, 'revision' => 1, 'currency' => 'COP', 'amount' => '999', 'is_active' => true])->assertOk();
        DB::table('products')->where('id', $work['leaf']['id'])->update(['availability_schedule_enabled' => true]);
        DB::table('tax_profiles')->whereIn('id', array_column($profiles, 'id'))->update(['is_active' => false, 'revision' => 2]);
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.subtotal', '21.0102');
        $this->postJson('/api/v1/orders/preview', $input)->assertConflict();
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'product', 'tax_name' => 'Por producto', 'tax_rate' => '0', 'tip_enabled' => false])->assertOk();
        $this->getJson('/api/v1/orders/'.$order['id'].'/quote?discount_amount=1.01')->assertOk()->assertJsonPath('data.total', '21.9000')->assertJsonPath('data.calculation_version', 3)->assertJsonCount(2, 'data.tax_breakdown.items');
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'order_revision' => 1, 'settings_revision' => 2, 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'discount_amount' => '1.01', 'discount_reason' => 'Prueba de reparto', 'expected_total' => '21.90', 'received_amount' => '30'])->assertCreated()->assertJsonPath('data.total', '21.9000')->assertJsonCount(1, 'data.combos')->assertJsonCount(2, 'data.items')->json('data');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 2, 'cash_session_id' => $session['id'], 'cash_revision' => 2, 'reason' => 'Conservar composición'])->assertOk()->assertJsonPath('data.net_paid_amount', '0.0000')->assertJsonPath('data.combos.0.unit_price', '10.5051');
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }

    public function test_component_fk_cannot_reference_product_from_another_company(): void
    {
        $first = $this->work();
        $second = $this->work('fk-combo@example.test');
        $this->expectException(QueryException::class);
        DB::table('product_combo_components')->insert(['tenant_id' => $second['owner']->tenant_id, 'product_id' => $second['root']['id'], 'component_product_id' => $first['leaf']['id'], 'units' => 1, 'position' => 0, 'is_active' => true]);
    }

    public function test_reader_sees_composition_without_costs_and_cannot_write_or_replay_after_revocation(): void
    {
        $work = $this->work();
        $this->setupCombo($work);
        $role = DB::table('roles')->where('tenant_id', $work['owner']->tenant_id)->where('name', 'Encargado de inventario')->first();
        DB::table('role_permission')->insert(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'catalog.view')->value('id')]);
        $this->actingAs(User::factory()->create(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id]));
        $this->getJson($work['path'].'/combo-configuration?branch_id='.$work['branch'].'&channel=takeaway')->assertOk()->assertJsonMissingPath('data.0.product.cost_price');
        $this->putJson($work['path'].'/combo-settings', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 4, 'currency' => 'COP', 'allocation_mode' => 'equal'])->assertForbidden();
        $this->actingAs($work['owner']);
        $component = $this->getJson($work['path'].'/combo-components')->json('data.0.id');
        $body = ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 4, 'currency' => 'COP', 'revision' => 1, 'units' => 1, 'position' => 0, 'is_active' => false];
        $this->putJson($work['path'].'/combo-components/'.$component, $body)->assertOk();
        DB::table('role_permission')->where('role_id', $work['owner']->role_id)->where('permission_id', DB::table('permissions')->where('key', 'catalog.manage')->value('id'))->delete();
        $this->actingAs($work['owner']->fresh());
        $this->putJson($work['path'].'/combo-components/'.$component, $body)->assertForbidden();
    }

    public function test_order_audit_failure_rolls_back_header_billable_positions_event_and_uuid(): void
    {
        $work = $this->work();
        $input = $this->setupCombo($work);
        $preview = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->json('data');
        $before = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'order.created') {
                throw new \RuntimeException('Auditoría de pedido fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson('/api/v1/orders', $this->confirm($input, $preview));
            $this->fail('El pedido debe confirmar todo junto.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de pedido fallida', $error->getMessage());
        }
        foreach (['orders', 'order_items', 'order_combos', 'order_events'] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
        $this->assertDatabaseCount('idempotency_records', $before);
    }

    public function test_billable_position_cannot_reference_combo_header_from_another_order(): void
    {
        $work = $this->work();
        $input = $this->setupCombo($work);
        $preview = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->json('data');
        $first = $this->postJson('/api/v1/orders', $this->confirm($input, $preview))->assertCreated()->json('data');
        $second = $this->postJson('/api/v1/orders', $this->confirm($input, $preview))->assertCreated()->json('data');
        $this->expectException(QueryException::class);
        DB::table('order_items')->insert(['tenant_id' => $work['owner']->tenant_id, 'order_id' => $first['id'], 'order_combo_id' => $second['combos'][0]['id'], 'product_id' => $work['leaf']['id'], 'product_name' => 'Ajeno al pedido', 'sku' => 'POLLO', 'quantity' => 1, 'unit_price' => '1', 'line_subtotal' => '1']);
    }
}
