<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Orders\OrderModifiers;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductModifierGroup;
use App\Models\ProductModifierOption;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class OrderModifierTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(bool $variant = false): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'modifier-order@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Menú', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $product = $this->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $category, 'sale_price' => '100.005', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $variantId = null;
        $revision = 1;
        if ($variant) {
            $variantId = $this->postJson('/api/v1/products/'.$product['id'].'/variants', ['product_revision' => 1, 'currency' => 'COP', 'name' => 'Grande', 'sku' => 'PIZZA-G', 'sale_price' => '120.005', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data.id');
            $revision++;
        }
        $path = '/api/v1/products/'.$product['id'].'/modifier-groups';
        $addon = $this->postJson($path, ['idempotency_key' => (string) Str::uuid(), 'product_revision' => $revision, 'currency' => 'COP', 'name' => 'Adicionales', 'kind' => 'addon', 'min_select' => 1, 'max_select' => 2, 'is_active' => true, 'options' => [['name' => 'Queso', 'extra_price' => '2.5050', 'is_active' => true], ['name' => 'Champiñones', 'extra_price' => '1.0050', 'is_active' => true]]])->assertCreated()->json('data');
        $revision++;
        $exclusion = $this->postJson($path, ['idempotency_key' => (string) Str::uuid(), 'product_revision' => $revision, 'currency' => 'COP', 'name' => 'Sin ingredientes', 'kind' => 'exclusion', 'min_select' => 0, 'max_select' => 1, 'is_active' => true, 'options' => [['name' => 'Sin cebolla', 'extra_price' => '0', 'is_active' => true]]])->assertCreated()->json('data');
        $revision++;
        $groups = $this->getJson('/api/v1/products/'.$product['id'].'/modifier-configuration')->assertOk()->json('data');
        $branch = app(TenantContext::class)->run($owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $line = ['product_id' => $product['id'], 'variant_id' => $variantId, 'quantity' => 2, 'product_revision' => $revision, 'expected_unit_price' => $variant ? '123.5150' : '103.5150', 'modifiers' => [['group_id' => $addon['id'], 'option_ids' => array_column($groups[0]['options'], 'id')], ['group_id' => $exclusion['id'], 'option_ids' => [$groups[1]['options'][0]['id']]]]];
        $payload = ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [$line]];

        return compact('owner', 'product', 'path', 'addon', 'exclusion', 'groups', 'revision', 'payload', 'line');
    }

    public function test_variant_addons_and_exclusions_have_exact_unit_and_quantity_snapshots(): void
    {
        $work = $this->work(true);
        $this->postJson('/api/v1/orders', $work['payload'])->assertCreated()->assertJsonPath('data.subtotal', '247.0300')
            ->assertJsonPath('data.items.0.base_unit_price', '120.0050')->assertJsonPath('data.items.0.unit_price', '123.5150')
            ->assertJsonPath('data.items.0.modifiers_snapshot.0.group_name', 'Adicionales')->assertJsonPath('data.items.0.modifiers_snapshot.0.options.0.extra_price', '2.5050')
            ->assertJsonPath('data.items.0.modifiers_snapshot.1.kind', 'exclusion')->assertJsonPath('data.items.0.modifiers_snapshot.1.options.0.name', 'Sin cebolla');
        $this->getJson('/api/v1/products/'.$work['product']['id'])->assertJsonPath('data.modifier_groups_count', 2);
    }

    public function test_required_duplicate_foreign_and_forged_selections_reject_whole_order(): void
    {
        $work = $this->work();
        $original = $work['line']['modifiers'];
        foreach ([[], [$original[0], $original[0]], [['group_id' => $work['addon']['id'], 'option_ids' => [$original[0]['option_ids'][0], $original[0]['option_ids'][0]]]]] as $modifiers) {
            $payload = array_replace($work['payload'], ['idempotency_key' => (string) Str::uuid(), 'items' => [array_replace($work['line'], ['modifiers' => $modifiers])]]);
            $this->postJson('/api/v1/orders', $payload)->assertUnprocessable();
        }
        foreach ([[['group_id' => 999999, 'option_ids' => [1]]], [['group_id' => $work['addon']['id'], 'option_ids' => [$original[1]['option_ids'][0]]]]] as $modifiers) {
            $this->postJson('/api/v1/orders', array_replace($work['payload'], ['idempotency_key' => (string) Str::uuid(), 'items' => [array_replace($work['line'], ['modifiers' => $modifiers])]]))->assertConflict();
        }
        $this->postJson('/api/v1/orders', array_replace($work['payload'], ['items' => [array_replace($work['line'], ['expected_unit_price' => '100.0050'])]]))->assertConflict();
        $this->postJson('/api/v1/orders', array_replace($work['payload'], ['items' => [$work['line'], array_replace($work['line'], ['modifiers' => []])]]))->assertUnprocessable();
        $forged = $original;
        $forged[0]['extra_price'] = '0';
        $this->postJson('/api/v1/orders', array_replace($work['payload'], ['items' => [array_replace($work['line'], ['modifiers' => $forged])]]))->assertUnprocessable();
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
    }

    public function test_same_group_on_different_lines_is_valid_and_empty_optional_selection_is_allowed(): void
    {
        $work = $this->work();
        $second = $work['line'];
        $second['modifiers'][1]['option_ids'] = [];
        $this->postJson('/api/v1/orders', array_replace($work['payload'], ['items' => [$work['line'], $second]]))->assertCreated()->assertJsonPath('data.subtotal', '414.0600')->assertJsonCount(2, 'data.items')->assertJsonCount(1, 'data.items.1.modifiers_snapshot');
    }

    public function test_changed_catalog_never_reinterprets_order_and_uuid_replay_keeps_snapshot(): void
    {
        $work = $this->work();
        $original = $this->postJson('/api/v1/orders', $work['payload'])->assertCreated()->json('data');
        $option = $work['groups'][0]['options'][0];
        $this->putJson($work['path'].'/'.$work['addon']['id'].'/options/'.$option['id'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => $work['revision'], 'currency' => 'COP', 'name' => 'Queso nuevo', 'extra_price' => '50', 'is_active' => false])->assertOk();
        $this->postJson('/api/v1/orders', $work['payload'])->assertCreated()->assertJsonPath('data.id', $original['id'])->assertJsonPath('data.items.0.modifiers_snapshot.0.options.0.name', 'Queso')->assertJsonPath('data.subtotal', '207.0300');
        $this->postJson('/api/v1/orders', array_replace($work['payload'], ['idempotency_key' => (string) Str::uuid()]))->assertConflict();
        $this->getJson('/api/v1/orders/'.$original['id'])->assertJsonPath('data.items.0.modifiers_snapshot', $original['items'][0]['modifiers_snapshot']);
        $this->assertDatabaseCount('orders', 1);
    }

    public function test_product_tax_discount_split_installments_and_refund_preserve_modifier_price(): void
    {
        $work = $this->work();
        $profile = $this->postJson('/api/v1/tax-profiles', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Incluido ficticio', 'price_mode' => 'inclusive', 'rates' => [['name' => 'Prueba', 'rate' => '10']], 'is_active' => true])->assertCreated()->json('data');
        $this->putJson('/api/v1/products/'.$work['product']['id'], ['revision' => $work['revision'], 'name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $work['product']['category_id'], 'sale_price' => '100.005', 'currency' => 'COP', 'is_active' => true, 'is_available' => true, 'tax_profile_id' => $profile['id'], 'tax_profile_revision' => 1])->assertOk();
        $work['payload']['items'][0]['product_revision']++;
        $work['payload']['items'][0]['expected_tax_revision'] = 1;
        $order = $this->postJson('/api/v1/orders', $work['payload'])->assertCreated()->json('data');
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'product', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'currency' => 'COP', 'opening_amount' => '1000'])->assertCreated()->json('data');
        $collect = ['idempotency_key' => (string) Str::uuid(), 'order_revision' => 1, 'settings_revision' => 2, 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'discount_amount' => '20.70', 'discount_reason' => 'Descuento de prueba', 'expected_total' => '186.33', 'split_count' => 3, 'account_number' => 1, 'received_amount' => '70'];
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', $collect)->assertCreated()->assertJsonPath('data.total', '186.3300')->assertJsonPath('data.taxable_base', '169.3900')->assertJsonPath('data.tax_amount', '16.9400')->assertJsonPath('data.items.0.modifiers_snapshot.0.options.0.name', 'Queso')->json('data');
        $cash = $this->getJson('/api/v1/payment-methods')->json('data.0');
        $bank = $this->postJson('/api/v1/payment-methods', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Transferencia', 'code' => 'bank', 'kind' => 'non_cash', 'is_active' => true])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 2, 'expected_balance' => '124.22', 'cash_session_id' => $session['id'], 'cash_revision' => 2, 'payments' => [['account_id' => $sale['accounts'][1]['id'], 'payment_method_id' => $cash['id'], 'method_revision' => 1, 'amount' => '62.11', 'received_amount' => '62.11'], ['account_id' => $sale['accounts'][2]['id'], 'payment_method_id' => $bank['id'], 'method_revision' => 1, 'amount' => '62.11', 'received_amount' => '62.11', 'reference' => 'MOD-PAY']]])->assertOk()->assertJsonPath('data.balance_due', '0.0000')->json('data');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refunds', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 3, 'expected_refundable' => '186.33', 'cash_session_id' => $session['id'], 'cash_revision' => 4, 'reason' => 'Compensación de prueba', 'refunds' => [['payment_id' => $sale['payments'][2]['id'], 'amount' => '1.01', 'reference' => 'MOD-DEV-1']]])->assertOk();
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 4, 'cash_session_id' => $session['id'], 'cash_revision' => 5, 'reason' => 'Cerrar con remanentes', 'refund_references' => [['payment_id' => $sale['payments'][2]['id'], 'reference' => 'MOD-DEV-REST']]])->assertOk()->assertJsonPath('data.net_paid_amount', '0.0000')->assertJsonPath('data.total', '186.3300');
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }

    public function test_unit_price_overflow_from_addon_is_rejected_without_floating_point(): void
    {
        $option = new ProductModifierOption(['name' => 'Extra', 'extra_price' => '0.0001', 'is_active' => true]);
        $option->id = 1;
        $group = new ProductModifierGroup(['name' => 'Grupo', 'is_active' => true, 'min_select' => 1, 'max_select' => 1]);
        $group->id = 1;
        $group->setRelation('options', collect([$option]));
        $product = (new Product)->setRelation('modifierGroups', collect([$group]));
        $this->expectException(ValidationException::class);
        app(OrderModifiers::class)->resolve($product, '999999999999999.9999', [['group_id' => 1, 'option_ids' => [1]]]);
    }
}
