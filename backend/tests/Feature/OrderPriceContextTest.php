<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class OrderPriceContextTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'order-price@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Menú', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $product = $this->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $category, 'sale_price' => '100.0050', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        [$branch, $other] = app(TenantContext::class)->run($owner->tenant_id, fn () => [Branch::firstOrFail()->id, Branch::create(['name' => 'Norte', 'code' => 'NORTE', 'is_active' => true])->id]);
        $group = $this->postJson('/api/v1/products/'.$product['id'].'/modifier-groups', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'currency' => 'COP', 'name' => 'Extras', 'kind' => 'addon', 'min_select' => 1, 'max_select' => 1, 'is_active' => true, 'options' => [['name' => 'Queso', 'extra_price' => '2.5050', 'is_active' => true]]])->assertCreated()->json('data');
        $option = $this->getJson('/api/v1/products/'.$product['id'].'/modifier-configuration')->json('data.0.options.0.id');
        $path = '/api/v1/products/'.$product['id'].'/context-prices';
        $rule = $this->postJson($path, ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'currency' => 'COP', 'branch_id' => $branch, 'channel' => 'takeaway', 'amount' => '80.0050', 'is_active' => true])->assertCreated()->json('data');
        $this->postJson($path, ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 3, 'currency' => 'COP', 'branch_id' => null, 'channel' => 'dine_in', 'amount' => '90.0050', 'is_active' => true])->assertCreated();
        $input = ['branch_id' => $branch, 'currency' => 'COP', 'channel' => 'takeaway', 'items' => [['product_id' => $product['id'], 'quantity' => 2, 'notes' => 'Poco dorada', 'modifiers' => [['group_id' => $group['id'], 'option_ids' => [$option]]]]]];

        return compact('owner', 'category', 'product', 'branch', 'other', 'group', 'option', 'path', 'rule', 'input');
    }

    private function confirm(array $work, array $preview): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $preview['branch_id'], 'currency' => $preview['currency'], 'channel' => $preview['channel'],
            'items' => array_map(fn ($line) => array_intersect_key($line, array_flip(['product_id', 'variant_id', 'quantity', 'notes', 'modifiers', 'product_revision', 'expected_unit_price', 'expected_tax_revision'])), $preview['items'])];
    }

    public function test_menu_exposes_context_separately_and_requires_complete_active_branch_context(): void
    {
        $work = $this->work();
        $this->getJson('/api/v1/products')->assertOk()->assertJsonPath('data.0.sale_price', '100.0050')->assertJsonMissingPath('data.0.price_context');
        $this->getJson('/api/v1/products?branch_id='.$work['branch'].'&channel=takeaway')->assertOk()->assertJsonPath('data.0.sale_price', '100.0050')->assertJsonPath('data.0.price_context.amount', '80.0050')->assertJsonPath('data.0.price_context.rule_id', $work['rule']['id']);
        $this->getJson('/api/v1/products?branch_id='.$work['other'].'&channel=takeaway')->assertJsonPath('data.0.price_context.amount', '100.0050')->assertJsonPath('data.0.price_context.source', 'product');
        $this->getJson('/api/v1/products?branch_id='.$work['other'].'&channel=dine_in')->assertJsonPath('data.0.price_context.amount', '90.0050');
        $this->getJson('/api/v1/products?channel=takeaway')->assertUnprocessable();
        $this->getJson('/api/v1/products?branch_id='.$work['branch'])->assertUnprocessable();
        $this->getJson('/api/v1/products?branch_id='.$work['branch'].'&channel=delivery')->assertUnprocessable();
        DB::table('branches')->where('id', $work['other'])->update(['is_active' => false]);
        $this->getJson('/api/v1/products?branch_id='.$work['other'].'&channel=takeaway')->assertConflict();
    }

    public function test_preview_preserves_preparation_with_current_context_prices_and_never_writes_business_records(): void
    {
        $work = $this->work();
        $before = [];
        foreach (['orders', 'order_items', 'order_events', 'audit_logs', 'idempotency_records', 'cash_sessions', 'payments', 'product_context_prices'] as $table) {
            $before[$table] = DB::table($table)->get()->toJson();
        }
        $preview = $this->postJson('/api/v1/orders/preview', $work['input'])->assertOk()->assertJsonPath('data.subtotal', '165.0200')->assertJsonPath('data.items.0.expected_unit_price', '82.5100')->assertJsonPath('data.items.0.product_revision', 4)->assertJsonPath('data.items.0.notes', 'Poco dorada')->assertJsonPath('data.items.0.modifier_labels.0.options.0.name', 'Queso')->assertJsonPath('data.items.0.price_context.amount', '80.0050')->assertJsonMissingPath('data.items.0.cost_price')->json('data');
        $this->postJson('/api/v1/orders/preview', array_replace($work['input'], ['channel' => 'dine_in']))->assertOk()->assertJsonPath('data.subtotal', '185.0200');
        $this->postJson('/api/v1/orders/preview', array_replace($work['input'], ['branch_id' => $work['other']]))->assertOk()->assertJsonPath('data.subtotal', '205.0200');
        foreach ($before as $table => $json) {
            $this->assertSame($json, DB::table($table)->get()->toJson(), $table.' se conserva al cotizar.');
        }
        $payload = $this->confirm($work, $preview);
        $payload['items'][0]['expected_unit_price'] = '1';
        $this->postJson('/api/v1/orders', $payload)->assertConflict();
        $payload = $this->confirm($work, $preview);
        $this->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.subtotal', '165.0200')->assertJsonPath('data.items.0.price_snapshot.rule_id', $work['rule']['id'])->assertJsonPath('data.items.0.base_unit_price', '80.0050');
    }

    public function test_rule_changes_do_not_reprice_order_replay_collect_split_payments_or_refund(): void
    {
        $work = $this->work();
        $preview = $this->postJson('/api/v1/orders/preview', $work['input'])->assertOk()->json('data');
        $payload = $this->confirm($work, $preview);
        $order = $this->postJson('/api/v1/orders', $payload)->assertCreated()->json('data');
        $this->putJson($work['path'].'/'.$work['rule']['id'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 4, 'revision' => 1, 'currency' => 'COP', 'amount' => '50', 'is_active' => false])->assertOk();
        $this->putJson('/api/v1/products/'.$work['product']['id'].'/modifier-groups/'.$work['group']['id'].'/options/'.$work['option'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 5, 'currency' => 'COP', 'name' => 'Queso nuevo', 'extra_price' => '99', 'is_active' => true])->assertOk();
        $this->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.items.0.unit_price', '82.5100')->assertJsonPath('data.items.0.price_snapshot.rule_revision', 1);
        $this->postJson('/api/v1/orders', array_replace($payload, ['idempotency_key' => (string) Str::uuid()]))->assertConflict();
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'exclusive', 'tax_name' => 'Impuesto ficticio', 'tax_rate' => '10'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'currency' => 'COP', 'opening_amount' => '1000'])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'order_revision' => 1, 'settings_revision' => 2, 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'discount_amount' => '15.02', 'discount_reason' => 'Prueba de contexto histórico', 'expected_total' => '165', 'split_count' => 2, 'account_number' => 1, 'received_amount' => '100'])->assertCreated()->assertJsonPath('data.total', '165.0000')->assertJsonPath('data.items.0.price_snapshot.amount', '80.0050')->json('data');
        $bank = $this->postJson('/api/v1/payment-methods', ['idempotency_key' => (string) Str::uuid(), 'name' => 'Transferencia', 'code' => 'bank', 'kind' => 'non_cash', 'is_active' => true])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/sales/'.$sale['id'].'/payments', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 2, 'expected_balance' => '82.50', 'cash_session_id' => $session['id'], 'cash_revision' => 2, 'payments' => [['account_id' => $sale['accounts'][1]['id'], 'payment_method_id' => $bank['id'], 'method_revision' => 1, 'amount' => '82.50', 'received_amount' => '82.50', 'reference' => 'CTX-PAGO']]])->assertOk()->assertJsonPath('data.balance_due', '0.0000')->json('data');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 3, 'cash_session_id' => $session['id'], 'cash_revision' => 3, 'reason' => 'Devolver historial intacto', 'refund_references' => [['payment_id' => $sale['payments'][1]['id'], 'reference' => 'CTX-DEV']]])->assertOk()->assertJsonPath('data.total', '165.0000')->assertJsonPath('data.net_paid_amount', '0.0000')->assertJsonPath('data.items.0.price_snapshot.rule_id', $work['rule']['id']);
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }

    public function test_preview_rejects_unavailable_preparation_currency_forged_values_and_missing_permission(): void
    {
        $work = $this->work();
        $invalid = $work['input'];
        $invalid['items'][0]['expected_unit_price'] = '1';
        $this->postJson('/api/v1/orders/preview', $invalid)->assertUnprocessable();
        $this->postJson('/api/v1/orders/preview', array_replace($work['input'], ['idempotency_key' => (string) Str::uuid()]))->assertUnprocessable();
        $this->postJson('/api/v1/orders/preview', array_replace($work['input'], ['currency' => 'USD']))->assertConflict();
        $invalid = $work['input'];
        $invalid['items'][0]['modifiers'] = [];
        $this->postJson('/api/v1/orders/preview', $invalid)->assertUnprocessable();
        DB::table('categories')->where('id', $work['category'])->update(['is_active' => false]);
        $this->postJson('/api/v1/orders/preview', $work['input'])->assertConflict();
        $role = DB::table('roles')->where('tenant_id', $work['owner']->tenant_id)->where('name', 'Encargado de inventario')->first();
        $this->actingAs(User::factory()->create(['tenant_id' => $work['owner']->tenant_id, 'role_id' => $role->id]));
        $this->postJson('/api/v1/orders/preview', $work['input'])->assertForbidden();
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
    }

    public function test_variant_menu_resolves_own_rule_without_overwriting_base_or_product_card(): void
    {
        $work = $this->work();
        $variant = $this->postJson('/api/v1/products/'.$work['product']['id'].'/variants', ['product_revision' => 4, 'currency' => 'COP', 'name' => 'Grande', 'sku' => 'PIZZA-G', 'sale_price' => '120.0050', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->postJson($work['path'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 5, 'currency' => 'COP', 'variant_id' => $variant['id'], 'branch_id' => null, 'channel' => 'takeaway', 'amount' => '110.0050', 'is_active' => true])->assertCreated();
        $url = '/api/v1/products/'.$work['product']['id'].'/variants';
        $this->getJson($url)->assertJsonPath('data.0.sale_price', '120.0050')->assertJsonMissingPath('data.0.price_context');
        $this->getJson($url.'?branch_id='.$work['branch'].'&channel=takeaway')->assertJsonPath('data.0.sale_price', '120.0050')->assertJsonPath('data.0.price_context.amount', '110.0050')->assertJsonPath('product_revision', 6);
        $this->getJson('/api/v1/products?branch_id='.$work['branch'].'&channel=takeaway')->assertJsonPath('data.0.price_context', null);
        $input = $work['input'];
        $input['items'][0]['variant_id'] = $variant['id'];
        $this->postJson('/api/v1/orders/preview', $input)->assertOk()->assertJsonPath('data.items.0.base_unit_price', '110.0050')->assertJsonPath('data.items.0.expected_unit_price', '112.5100');
    }
}
