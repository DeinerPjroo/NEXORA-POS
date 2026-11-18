<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class OrderAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->travelTo(CarbonImmutable::parse('2026-11-18T16:30:00Z'));
    }

    private function work(): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'order-schedule@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Carta', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $product = $this->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $category, 'sale_price' => '100.0050', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $path = '/api/v1/products/'.$product['id'];
        $window = $this->postJson($path.'/availability-windows', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'currency' => 'COP', 'expected_timezone' => 'America/Bogota', 'name' => 'Almuerzo', 'weekday' => 3, 'start_time' => '11:00', 'end_time' => '12:00', 'ends_next_day' => false, 'is_active' => true])->assertCreated()->json('data');
        $this->putJson($path.'/availability-policy', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'currency' => 'COP', 'expected_timezone' => 'America/Bogota', 'enabled' => true])->assertOk();
        $variant = $this->postJson($path.'/variants', ['product_revision' => 3, 'currency' => 'COP', 'name' => 'Grande', 'sku' => 'PIZZA-G', 'sale_price' => '120.0050', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $group = $this->postJson($path.'/modifier-groups', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 4, 'currency' => 'COP', 'name' => 'Extras', 'kind' => 'addon', 'min_select' => 1, 'max_select' => 1, 'is_active' => true, 'options' => [['name' => 'Queso', 'extra_price' => '2.5050', 'is_active' => true]]])->assertCreated()->json('data');
        $option = $this->getJson($path.'/modifier-configuration')->json('data.0.options.0.id');
        $this->postJson($path.'/context-prices', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 5, 'currency' => 'COP', 'variant_id' => $variant['id'], 'branch_id' => null, 'channel' => 'takeaway', 'amount' => '80.0050', 'is_active' => true])->assertCreated();
        $branch = app(TenantContext::class)->run($owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $input = ['branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $product['id'], 'variant_id' => $variant['id'], 'quantity' => 2, 'notes' => 'Conservar preparación', 'modifiers' => [['group_id' => $group['id'], 'option_ids' => [$option]]]]]];

        return compact('owner', 'product', 'path', 'window', 'input');
    }

    private function confirm(array $input, array $preview): array
    {
        return [...$input, 'idempotency_key' => (string) Str::uuid(), 'items' => array_map(fn ($line) => array_intersect_key($line, array_flip(['product_id', 'variant_id', 'quantity', 'notes', 'modifiers', 'product_revision', 'expected_unit_price', 'expected_tax_revision'])), $preview['items'])];
    }

    public function test_closing_after_preview_rejects_entire_order_but_saved_order_replay_collect_and_refund_keep_snapshot(): void
    {
        $work = $this->work();
        $preview = $this->postJson('/api/v1/orders/preview', $work['input'])->assertOk()->assertJsonPath('data.items.0.availability_context.allowed', true)->assertJsonPath('data.items.0.expected_unit_price', '82.5100')->json('data');
        $payload = $this->confirm($work['input'], $preview);
        $this->travelTo(CarbonImmutable::parse('2026-11-18T17:00:00Z'));
        $this->postJson('/api/v1/orders/preview', $work['input'])->assertConflict();
        $this->postJson('/api/v1/orders', $payload)->assertConflict();
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
        $this->travelTo(CarbonImmutable::parse('2026-11-18T16:59:59Z'));
        $order = $this->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.items.0.availability_snapshot.windows.0.name', 'Almuerzo')->assertJsonPath('data.items.0.availability_snapshot.timezone', 'America/Bogota')->assertJsonPath('data.items.0.availability_snapshot.checked_at', '2026-11-18T16:59:59+00:00')->assertJsonPath('data.subtotal', '165.0200')->json('data');
        $this->travelTo(CarbonImmutable::parse('2026-11-18T17:00:00Z'));
        $this->putJson($work['path'].'/availability-windows/'.$work['window']['id'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 6, 'revision' => 1, 'currency' => 'COP', 'expected_timezone' => 'America/Bogota', 'name' => 'Cerrado posteriormente', 'weekday' => 3, 'start_time' => '11:00', 'end_time' => '12:00', 'ends_next_day' => false, 'is_active' => false])->assertOk();
        $this->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.items.0.availability_snapshot.windows.0.name', 'Almuerzo');
        $this->postJson('/api/v1/orders', array_replace($payload, ['idempotency_key' => (string) Str::uuid()]))->assertConflict();
        $this->putJson('/api/v1/sales/settings', ['revision' => 1, 'confirmed' => true, 'tax_mode' => 'none', 'tax_name' => 'Prueba', 'tax_rate' => '0'])->assertOk();
        $register = $this->getJson('/api/v1/cash/registers')->json('data.0.id');
        $session = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $sale = $this->postJson('/api/v1/orders/'.$order['id'].'/collect', ['idempotency_key' => (string) Str::uuid(), 'order_revision' => 1, 'settings_revision' => 2, 'cash_session_id' => $session['id'], 'cash_revision' => 1, 'discount_amount' => '0', 'expected_total' => '165.02', 'received_amount' => '200'])->assertCreated()->assertJsonPath('data.total', '165.0200')->assertJsonPath('data.items.0.availability_snapshot.windows.0.name', 'Almuerzo')->json('data');
        $this->postJson('/api/v1/sales/'.$sale['id'].'/refund', ['idempotency_key' => (string) Str::uuid(), 'sale_revision' => 2, 'cash_session_id' => $session['id'], 'cash_revision' => 2, 'reason' => 'Devolver conservando historia'])->assertOk()->assertJsonPath('data.net_paid_amount', '0.0000')->assertJsonPath('data.items.0.availability_snapshot.windows.0.name', 'Almuerzo');
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertJsonPath('data.expected_amount', '1000.0000');
    }

    public function test_company_timezone_change_is_applied_to_new_checks_and_keeps_stored_zone(): void
    {
        $work = $this->work();
        $preview = $this->postJson('/api/v1/orders/preview', $work['input'])->assertOk()->json('data');
        $order = $this->postJson('/api/v1/orders', $this->confirm($work['input'], $preview))->assertCreated()->json('data');
        DB::table('tenants')->where('id', $work['owner']->tenant_id)->update(['timezone' => 'Europe/Madrid']);
        $this->getJson($work['path'])->assertJsonPath('data.sellable', false)->assertJsonPath('data.availability_context.timezone', 'Europe/Madrid');
        $this->postJson('/api/v1/orders/preview', $work['input'])->assertConflict();
        $this->getJson('/api/v1/orders/'.$order['id'])->assertJsonPath('data.items.0.availability_snapshot.timezone', 'America/Bogota');
        DB::table('tenants')->where('id', $work['owner']->tenant_id)->update(['timezone' => 'America/Bogota']);
        DB::table('products')->where('id', $work['product']['id'])->update(['is_available' => false]);
        $this->getJson($work['path'])->assertJsonPath('data.availability_context.allowed', true)->assertJsonPath('data.sellable', false);
        $this->postJson('/api/v1/orders/preview', $work['input'])->assertConflict();
    }
}
