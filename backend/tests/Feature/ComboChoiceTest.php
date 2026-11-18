<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class ComboChoiceTest extends TestCase
{
    use RefreshDatabase;

    private array $root;

    private array $leaves;

    private int $branch;

    private User $owner;

    private string $path;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'choice@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($this->owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Carta', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $base = ['category_id' => $category, 'currency' => 'COP', 'is_active' => true, 'is_available' => true];
        foreach (['Pollo' => '2', 'Arroz' => '1', 'Sopa' => '0'] as $name => $price) {
            $this->leaves[] = $this->postJson('/api/v1/products', [...$base, 'name' => $name, 'sku' => $name, 'sale_price' => $price])->assertCreated()->json('data');
        }
        $this->root = $this->postJson('/api/v1/products', [...$base, 'kind' => 'combo', 'name' => 'Menú', 'sku' => 'MENU', 'sale_price' => '10.0001'])->assertCreated()->json('data');
        $this->branch = app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $this->path = '/api/v1/products/'.$this->root['id'];
        $this->putJson($this->path.'/combo-settings', [...$this->context(), 'allocation_mode' => 'equal'])->assertOk();
    }

    private function context(): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'product_revision' => (int) DB::table('products')->where('id', $this->root['id'])->value('revision'), 'currency' => 'COP'];
    }

    private function group(array $values = []): array
    {
        return $this->postJson($this->path.'/combo-groups', [...$this->context(), 'name' => 'Acompañamiento', 'min_select' => 0, 'max_select' => 1, 'position' => 0, 'is_active' => true, ...$values])->assertCreated()->json('data');
    }

    private function part(?int $groupId, int $leaf = 0, int $units = 1): array
    {
        return $this->postJson($this->path.'/combo-components', [...$this->context(), 'combo_group_id' => $groupId, 'component_product_id' => $this->leaves[$leaf]['id'], 'component_product_revision' => $this->leaves[$leaf]['revision'], 'units' => $units, 'position' => $leaf, 'is_active' => true])->assertCreated()->json('data');
    }

    private function updateGroup(array $group, array $values = []): array
    {
        return [...$this->context(), ...array_intersect_key($group, array_flip(['name', 'min_select', 'max_select', 'position', 'is_active'])), 'revision' => (int) DB::table('product_combo_groups')->where('id', $group['id'])->value('revision'), ...$values];
    }

    private function input(array $parts): array
    {
        $selections = [];
        foreach ($parts as $part) {
            for ($index = 0; $index < $part['units']; $index++) {
                $selections[] = ['component_id' => $part['id'], 'unit_index' => $index, 'notes' => 'Unidad '.$index];
            }
        }

        return ['branch_id' => $this->branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['kind' => 'combo', 'selection_version' => 2, 'product_id' => $this->root['id'], 'quantity' => 2, 'notes' => 'Elegido', 'components' => $selections]]];
    }

    private function confirm(array $input): array
    {
        $line = $this->postJson('/api/v1/orders/preview', $input)->assertOk()->json('data.items.0');
        $input['items'][0]['product_revision'] = $line['product_revision'];
        $input['items'][0]['expected_unit_price'] = $line['expected_unit_price'];
        $input['items'][0]['components'] = array_map(fn ($part) => array_intersect_key($part, array_flip(['component_id', 'unit_index', 'product_revision', 'expected_tax_revision', 'notes', 'modifiers'])), $line['components']);

        return [...$input, 'idempotency_key' => (string) Str::uuid()];
    }

    public function test_selected_alternative_units_allocate_exactly_and_copy_group_history(): void
    {
        $fixed = $this->part(null);
        $group = $this->group();
        $option = $this->part($group['id'], 1, 2);
        $this->part($group['id'], 2, 20);
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['min_select' => 1]))->assertOk();
        $input = $this->input([$option, $fixed]);
        $this->getJson($this->path.'/combo-configuration?branch_id='.$this->branch.'&channel=takeaway')->assertOk()->assertJsonPath('selection_version', 2)->assertJsonCount(1, 'groups')->assertJsonPath('combo_context.expanded_units', 3)->assertJsonCount(3, 'data');
        $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonPath('data.subtotal', '20.0002')->assertJsonPath('data.items.0.components.0.component_id', $fixed['id'])->assertJsonPath('data.items.0.components.0.base_unit_price', '3.3334')->assertJsonPath('data.items.0.components.2.base_unit_price', '3.3333');
        $body = $this->confirm($input);
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonCount(3, 'data.items')->assertJsonPath('data.combos.0.snapshot.version', 2)->assertJsonPath('data.combos.0.snapshot.groups.0.name', 'Acompañamiento')->assertJsonPath('data.combos.0.snapshot.groups.0.selected_component_ids', [$option['id']])->json('data');
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['name' => 'Nuevo nombre', 'is_active' => false]))->assertOk();
        $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.combos.0.snapshot.groups.0.name', 'Acompañamiento');
        $this->postJson('/api/v1/orders/preview', $input)->assertConflict();
        $this->assertDatabaseCount('order_combos', 1);
        $this->assertDatabaseHas('product_combo_components', ['id' => $option['id'], 'is_active' => true]);
    }

    public function test_optional_groups_can_be_omitted_but_empty_selection_and_old_contract_are_rejected(): void
    {
        $group = $this->group();
        $part = $this->part($group['id']);
        $input = $this->input([$part]);
        $old = $input;
        unset($old['items'][0]['selection_version']);
        $this->postJson('/api/v1/orders/preview', $old)->assertConflict();
        $this->postJson('/api/v1/orders/preview', $input)->assertOk();
        $this->postJson('/api/v1/orders/preview', $this->input([]))->assertUnprocessable();
        $fixed = $this->part(null, 1);
        $this->postJson('/api/v1/orders/preview', $this->input([$fixed]))->assertOk()->assertJsonPath('data.items.0.groups.0.selected_component_ids', []);
        $this->postJson('/api/v1/orders/preview', $input)->assertConflict();
    }

    public function test_group_minimum_maximum_and_complete_unique_units_are_authoritative(): void
    {
        $group = $this->group();
        $first = $this->part($group['id'], 0, 2);
        $second = $this->part($group['id'], 1);
        $fixed = $this->part(null, 2);
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['min_select' => 1]))->assertOk();
        $this->postJson('/api/v1/orders/preview', $this->input([$fixed]))->assertConflict();
        $this->postJson('/api/v1/orders/preview', $this->input([$fixed, $first, $second]))->assertConflict();
        $input = $this->input([$fixed, $first]);
        $body = $input;
        array_pop($body['items'][0]['components']);
        $this->postJson('/api/v1/orders/preview', $body)->assertConflict();
        $body = $input;
        $body['items'][0]['components'][2] = $body['items'][0]['components'][1];
        $this->postJson('/api/v1/orders/preview', $body)->assertUnprocessable();
        $body = $input;
        $body['items'][0]['components'][2]['unit_index'] = 19;
        $this->postJson('/api/v1/orders/preview', $body)->assertConflict();
        $body = $input;
        $body['items'][0]['components'][0]['group_id'] = $group['id'];
        $this->postJson('/api/v1/orders/preview', $body)->assertUnprocessable();
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_unavailable_unchosen_option_does_not_block_valid_selection_but_never_substitutes(): void
    {
        $group = $this->group();
        $first = $this->part($group['id']);
        $second = $this->part($group['id'], 1);
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['min_select' => 1]))->assertOk();
        DB::table('products')->where('id', $this->leaves[0]['id'])->update(['availability_schedule_enabled' => true]);
        $this->getJson($this->path)->assertJsonPath('data.sellable', true);
        $this->getJson($this->path.'/combo-configuration?branch_id='.$this->branch.'&channel=takeaway')->assertJsonPath('data.0.selection_context.allowed', false)->assertJsonPath('data.1.selection_context.allowed', true);
        $this->postJson('/api/v1/orders/preview', $this->input([$second]))->assertOk();
        $this->postJson('/api/v1/orders/preview', $this->input([$first]))->assertConflict();
        $body = $this->confirm($this->input([$second]));
        DB::table('products')->where('id', $this->leaves[1]['id'])->update(['is_available' => false]);
        $this->getJson($this->path)->assertJsonPath('data.sellable', false);
        $this->postJson('/api/v1/orders', $body)->assertConflict();
        $this->assertDatabaseCount('order_items', 0);
    }

    public function test_configuration_guards_minimum_capacity_expansion_stale_revisions_and_identity(): void
    {
        $this->postJson($this->path.'/combo-groups', [...$this->context(), 'name' => 'Imposible', 'min_select' => 1, 'max_select' => 1, 'position' => 0, 'is_active' => true])->assertUnprocessable();
        $group = $this->group();
        $option = $this->part($group['id'], 0, 20);
        $fixed = $this->part(null, 1);
        $update = $this->updateGroup($group, ['min_select' => 1]);
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $update)->assertUnprocessable();
        $this->assertDatabaseHas('product_combo_groups', ['id' => $group['id'], 'min_select' => 0]);
        $this->putJson($this->path.'/combo-components/'.$option['id'], [...$this->context(), 'revision' => 1, 'units' => 1, 'position' => 0, 'is_active' => true])->assertOk();
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $update)->assertConflict();
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['min_select' => 1]))->assertOk();
        $this->putJson($this->path.'/combo-components/'.$option['id'], [...$this->context(), 'revision' => 2, 'units' => 1, 'position' => 0, 'is_active' => false])->assertUnprocessable();
        $this->putJson($this->path.'/combo-components/'.$fixed['id'], [...$this->context(), 'revision' => 1, 'units' => 1, 'position' => 0, 'is_active' => true, 'combo_group_id' => $group['id']])->assertUnprocessable();
    }

    public function test_expansion_preflight_uses_only_selected_options_and_stops_before_full_catalog_load(): void
    {
        $group = $this->group(['max_select' => 2]);
        $first = $this->part($group['id'], 0, 20);
        $second = $this->part($group['id'], 1, 1);
        $input = $this->input([$first]);
        $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonCount(20, 'data.items.0.components');
        $input['items'] = array_fill(0, 6, $input['items'][0]);
        DB::enableQueryLog();
        $this->postJson('/api/v1/orders/preview', $input)->assertUnprocessable();
        $queries = collect(DB::getQueryLog())->pluck('query')->implode("\n");
        DB::disableQueryLog();
        $this->assertStringNotContainsString('product_modifier_groups', $queries);
        $this->postJson('/api/v1/orders/preview', $this->input([$second]))->assertOk()->assertJsonCount(1, 'data.items.0.components');
        $input = $this->input([$first]);
        $input['items'] = array_fill(0, 5, $input['items'][0]);
        $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonCount(5, 'data.items');
    }

    public function test_group_idempotency_permissions_pagination_scopes_and_audit_rollback(): void
    {
        $group = $this->group();
        $body = $this->updateGroup($group, ['name' => 'Bebida']);
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $body)->assertOk();
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $body)->assertOk()->assertJsonPath('data.revision', 2);
        $this->putJson($this->path.'/combo-groups/'.$group['id'], [...$body, 'name' => 'Diferente'])->assertConflict();
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['is_active' => false]))->assertOk();
        $this->getJson($this->path.'/combo-groups?status=inactive&per_page=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1);
        $this->putJson('/api/v1/products/'.$this->leaves[0]['id'].'/combo-groups/'.$group['id'], $body)->assertNotFound();
        $before = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'catalog.combo.group.created') {
                throw new \RuntimeException('Auditoría requerida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->group();
            $this->fail('Debe revertir la escritura.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría requerida', $error->getMessage());
        }
        $this->assertDatabaseCount('product_combo_groups', 1);
        $this->assertDatabaseCount('idempotency_records', $before);
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'catalog.manage')->value('id'))->delete();
        $this->withExceptionHandling()->actingAs($this->owner->fresh());
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $body)->assertForbidden();
    }

    public function test_active_group_and_alternative_limits_archive_capacity_without_deleting_history(): void
    {
        $group = $this->group();
        for ($index = 0; $index < 20; $index++) {
            $option = $this->part($group['id']);
        }
        $this->postJson($this->path.'/combo-components', [...$this->context(), 'combo_group_id' => $group['id'], 'component_product_id' => $this->leaves[0]['id'], 'component_product_revision' => 1, 'units' => 1, 'position' => 0, 'is_active' => true])->assertUnprocessable();
        $this->putJson($this->path.'/combo-components/'.$option['id'], [...$this->context(), 'revision' => 1, 'units' => 1, 'position' => 0, 'is_active' => false])->assertOk();
        $this->part($group['id']);
        $this->assertDatabaseCount('product_combo_components', 21);
        for ($index = 0; $index < 7; $index++) {
            $this->group(['name' => 'Grupo '.$index]);
        }
        $this->postJson($this->path.'/combo-groups', [...$this->context(), 'name' => 'Noveno', 'min_select' => 0, 'max_select' => 1, 'position' => 0, 'is_active' => true])->assertUnprocessable();
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['is_active' => false]))->assertOk();
        $this->group();
        $this->assertDatabaseCount('product_combo_groups', 9);
        $this->getJson($this->path.'/combo-groups?status=active&per_page=5')->assertJsonCount(5, 'data')->assertJsonPath('meta.total', 8);
    }

    public function test_multiple_choices_mixed_taxes_discount_split_payments_and_refund_keep_original_selection(): void
    {
        $group = $this->group(['max_select' => 2]);
        $fixed = $this->part(null);
        $first = $this->part($group['id'], 1);
        $second = $this->part($group['id'], 2);
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['min_select' => 2]))->assertOk();
        foreach (['inclusive' => '10', 'exclusive' => '20'] as $mode => $rate) {
            $profile = $this->postJson('/api/v1/tax-profiles', ['idempotency_key' => (string) Str::uuid(), 'name' => $mode, 'price_mode' => $mode, 'rates' => [['name' => 'Tasa ficticia', 'rate' => $rate]], 'is_active' => true])->assertCreated()->json('data');
            DB::table('products')->where('id', $this->leaves[$mode === 'inclusive' ? 0 : 1]['id'])->update(['tax_profile_id' => $profile['id']]);
        }
        $modifier = $this->postJson('/api/v1/products/'.$this->leaves[1]['id'].'/modifier-groups', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'currency' => 'COP', 'name' => 'Extras', 'kind' => 'addon', 'min_select' => 0, 'max_select' => 1, 'is_active' => true, 'options' => [['name' => 'Salsa', 'extra_price' => '0.5050', 'is_active' => true]]])->assertCreated()->json('data');
        $optionId = $this->getJson('/api/v1/products/'.$this->leaves[1]['id'].'/modifier-configuration')->json('data.0.options.0.id');
        $input = $this->input([$fixed, $first, $second]);
        $input['items'][0]['components'][1]['modifiers'] = [['group_id' => $modifier['id'], 'option_ids' => [$optionId]]];
        $body = $this->confirm($input);
        $order = $this->postJson('/api/v1/orders', $body)->assertCreated()->assertJsonPath('data.subtotal', '21.0102')->assertJsonPath('data.combos.0.snapshot.groups.0.selected_component_ids', [$first['id'], $second['id']])->json('data');
        $this->putJson($this->path.'/combo-groups/'.$group['id'], $this->updateGroup($group, ['name' => 'Archivado', 'is_active' => false]))->assertOk();
        DB::table('tax_profiles')->update(['is_active' => false, 'revision' => 2]);
        DB::table('products')->whereIn('id', array_column($this->leaves, 'id'))->update(['availability_schedule_enabled' => true]);
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'product', 'tax_name' => 'Por producto', 'tax_rate' => '0', 'tip_enabled' => false])->assertOk();
        $this->getJson('/api/v1/orders/'.$order['id'].'/quote?discount_amount=1.01&split_count=2')->assertOk()->assertJsonPath('data.total', '21.4600')->assertJsonPath('data.calculation_version', 3)->assertJsonCount(3, 'data.tax_breakdown.items')->json('data');
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'order_revision' => 1, 'settings_revision' => 2, 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'discount_amount' => '1.01', 'discount_reason' => 'Prueba de alternativas', 'expected_total' => '21.46', 'received_amount' => '10', 'payment_amount' => '5', 'split_count' => 2, 'account_number' => 1])->assertCreated()->assertJsonPath('data.balance_due', '16.4600')->assertJsonCount(1, 'data.combos')->json('data');
        $cash = $this->getJson('/api/v1/payment-methods')->json('data.0.id');
        $payment = ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 2, 'expected_balance' => '16.46', 'cash_session_id' => $session['id'], 'cash_revision' => 2, 'payments' => [
            ['account_id' => $sale['accounts'][0]['id'], 'payment_method_id' => $cash, 'method_revision' => 1, 'amount' => '5.73', 'received_amount' => '5.73'],
            ['account_id' => $sale['accounts'][1]['id'], 'payment_method_id' => $cash, 'method_revision' => 1, 'amount' => '10.73', 'received_amount' => '10.73']]];
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $payment)->assertOk()->assertJsonPath('data.balance_due', '0.0000')->assertJsonPath('data.paid_amount', '21.4600');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', $payment)->assertOk();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 3, 'cash_session_id' => $session['id'], 'cash_revision' => 4, 'reason' => 'Conservar alternativas históricas'])->assertOk()->assertJsonPath('data.net_paid_amount', '0.0000')->assertJsonPath('data.combos.0.snapshot.groups.0.name', 'Acompañamiento');
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertJsonPath('data.expected_amount', '1000.0000');
        $this->assertDatabaseCount('order_items', 3);
        $this->assertDatabaseCount('payments', 3);
    }

    public function test_group_fk_and_api_cannot_reference_another_company(): void
    {
        $group = $this->group();
        $other = app(RegisterCompany::class)->execute(['company_name' => 'Otra', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Eva', 'email' => 'other-choice@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($other);
        $this->getJson($this->path.'/combo-groups')->assertNotFound();
        $this->actingAs($this->owner);
        $otherRoot = $this->postJson('/api/v1/products', ['category_id' => $this->root['category_id'], 'kind' => 'combo', 'name' => 'Otro', 'sku' => 'OTRO', 'sale_price' => '1', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->postJson('/api/v1/products/'.$otherRoot['id'].'/combo-components', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'currency' => 'COP', 'combo_group_id' => $group['id'], 'component_product_id' => $this->leaves[0]['id'], 'component_product_revision' => 1, 'units' => 1, 'position' => 0, 'is_active' => true])->assertUnprocessable();
        $this->expectException(QueryException::class);
        DB::table('product_combo_components')->insert(['tenant_id' => $this->owner->tenant_id, 'product_id' => $otherRoot['id'], 'combo_group_id' => $group['id'], 'component_product_id' => $this->leaves[0]['id'], 'units' => 1, 'position' => 0, 'is_active' => true]);
    }
}
