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

class CategoryHierarchyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function owner(string $email = 'hierarchy@example.test'): User
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);

        return $owner;
    }

    private function category(string $name, ?array $parent = null): array
    {
        return $this->postJson('/api/v1/categories', ['name' => $name, 'color' => '#8271FF', 'is_active' => true, 'parent_id' => $parent['id'] ?? null, 'parent_revision' => $parent['revision'] ?? null])->assertCreated()->json();
    }

    private function edit(array $category, array $changes = []): array
    {
        return array_replace(['name' => $category['name'], 'color' => $category['color'], 'is_active' => $category['is_active'], 'revision' => $category['revision']], $changes);
    }

    private function product(array $category, string $sku = 'HIER-1'): array
    {
        return $this->postJson('/api/v1/products', ['name' => 'Menú '.$sku, 'sku' => $sku, 'category_id' => $category['id'], 'sale_price' => '10.01', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
    }

    public function test_hierarchy_is_paginated_tenant_safe_and_root_product_filter_includes_children(): void
    {
        $this->owner();
        $root = $this->category('Platos');
        $child = $this->category('Pizzas', $root);
        $other = $this->category('Bebidas');
        $this->assertSame($root['id'], $child['parent_id']);
        $this->assertSame('Platos', $child['parent']['name']);
        $this->assertTrue($child['effective_active']);
        $this->assertArrayNotHasKey('tenant_id', $child);
        $this->product($root);
        $this->product($child, 'HIER-2');
        $this->product($other, 'HIER-3');
        $this->getJson('/api/v1/products?category_id='.$root['id'])->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/products?category_id='.$child['id'])->assertJsonCount(1, 'data')->assertJsonPath('data.0.category.parent.name', 'Platos');
        $this->getJson('/api/v1/categories?parent_id='.$root['id'])->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $child['id']);
        $this->getJson('/api/v1/categories?level=root&search=Platos')->assertJsonCount(1, 'data')->assertJsonPath('data.0.children_count', 1)->assertJsonPath('data.0.products_count', 1);
        for ($index = 0; $index < 11; $index++) {
            $this->category('Principal '.$index);
        }
        $this->getJson('/api/v1/categories?level=root&per_page=10')->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 13)->assertJsonPath('meta.last_page', 2);
        $this->getJson('/api/v1/categories?level=root&per_page=10&page=2')->assertJsonCount(3, 'data');
        $this->getJson('/api/v1/categories?level=child')->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Pizzas');
    }

    public function test_self_parent_third_level_root_with_children_and_stale_parent_are_rejected(): void
    {
        $this->owner();
        $root = $this->category('Platos');
        $child = $this->category('Pizzas', $root);
        $other = $this->category('Bebidas');
        $this->putJson('/api/v1/categories/'.$root['id'], $this->edit($root, ['parent_id' => $root['id'], 'parent_revision' => 1]))->assertUnprocessable();
        $this->putJson('/api/v1/categories/'.$root['id'], $this->edit($root, ['parent_id' => $other['id'], 'parent_revision' => 1]))->assertUnprocessable();
        $this->postJson('/api/v1/categories', ['name' => 'Tercer nivel', 'color' => '#8271FF', 'is_active' => true, 'parent_id' => $child['id'], 'parent_revision' => 1])->assertUnprocessable();
        $this->putJson('/api/v1/categories/'.$child['id'], $this->edit($child, ['parent_id' => $other['id'], 'parent_revision' => 99]))->assertConflict();
        $this->putJson('/api/v1/categories/'.$child['id'], $this->edit($child, ['parent_id' => $other['id']]))->assertUnprocessable();
        $this->getJson('/api/v1/categories?level=recursive')->assertUnprocessable();
        $this->assertDatabaseCount('categories', 3);
        $this->assertDatabaseHas('categories', ['id' => $child['id'], 'parent_id' => $root['id'], 'revision' => 1]);
    }

    public function test_parent_archival_blocks_new_orders_without_rewriting_child_product_or_prior_order(): void
    {
        $owner = $this->owner();
        $root = $this->category('Platos');
        $child = $this->category('Pizzas', $root);
        $product = $this->product($child);
        $branch = app(TenantContext::class)->run($owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $payload = ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'channel' => 'takeaway', 'currency' => 'COP', 'items' => [['product_id' => $product['id'], 'product_revision' => 1, 'quantity' => 1, 'expected_unit_price' => '10.01']]];
        $order = $this->postJson('/api/v1/orders', $payload)->assertCreated()->json('data');
        $this->putJson('/api/v1/categories/'.$root['id'], $this->edit($root, ['is_active' => false]))->assertOk();
        $this->getJson('/api/v1/categories?parent_id='.$root['id'])->assertJsonPath('data.0.is_active', true)->assertJsonPath('data.0.effective_active', false)->assertJsonPath('data.0.revision', 1);
        $this->getJson('/api/v1/products/'.$product['id'])->assertJsonPath('data.sellable', false)->assertJsonPath('data.is_active', true)->assertJsonPath('data.revision', 1);
        $this->postJson('/api/v1/orders', array_replace($payload, ['idempotency_key' => (string) Str::uuid()]))->assertConflict();
        $this->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.id', $order['id'])->assertJsonPath('data.subtotal', '10.0100');
        $this->putJson('/api/v1/categories/'.$root['id'], $this->edit($root, ['revision' => 2, 'is_active' => true]))->assertOk();
        $this->getJson('/api/v1/products/'.$product['id'])->assertJsonPath('data.sellable', true);
        $this->postJson('/api/v1/orders', array_replace($payload, ['idempotency_key' => (string) Str::uuid()]))->assertCreated();
        $this->assertDatabaseCount('orders', 2);
    }

    public function test_reparent_unlink_and_legacy_edit_preserve_revision_control(): void
    {
        $this->owner();
        $root = $this->category('Platos');
        $child = $this->category('Pizzas', $root);
        $other = $this->category('Bebidas');
        $this->putJson('/api/v1/categories/'.$other['id'], $this->edit($other, ['name' => 'Bebidas frías']))->assertOk();
        $this->putJson('/api/v1/categories/'.$child['id'], $this->edit($child, ['parent_id' => $other['id'], 'parent_revision' => 1]))->assertConflict();
        $moved = $this->putJson('/api/v1/categories/'.$child['id'], $this->edit($child, ['parent_id' => $other['id'], 'parent_revision' => 2]))->assertOk()->assertJsonPath('parent.name', 'Bebidas frías')->assertJsonPath('revision', 2)->json();
        $this->putJson('/api/v1/categories/'.$child['id'], $this->edit($child, ['parent_id' => null]))->assertConflict();
        $renamed = $this->putJson('/api/v1/categories/'.$child['id'], $this->edit($moved, ['name' => 'Especiales']))->assertOk()->assertJsonPath('parent_id', $other['id'])->json();
        $this->putJson('/api/v1/categories/'.$child['id'], $this->edit($renamed, ['parent_id' => null]))->assertOk()->assertJsonPath('parent_id', null)->assertJsonPath('parent', null)->assertJsonPath('revision', 4);
        $this->assertDatabaseHas('categories', ['id' => $root['id'], 'revision' => 1]);
    }

    public function test_foreign_parent_and_unprivileged_category_changes_are_rejected(): void
    {
        $first = $this->owner();
        $root = $this->category('Platos');
        $other = $this->owner('other-hierarchy@example.test');
        $this->postJson('/api/v1/categories', ['name' => 'Ajena', 'color' => '#8271FF', 'is_active' => true, 'parent_id' => $root['id'], 'parent_revision' => 1])->assertUnprocessable();
        $this->getJson('/api/v1/categories?parent_id='.$root['id'])->assertUnprocessable();
        $this->putJson('/api/v1/categories/'.$root['id'], $this->edit($root))->assertNotFound();
        $role = DB::table('roles')->where('tenant_id', $other->tenant_id)->where('name', 'Cajero')->first();
        $this->actingAs(User::factory()->create(['tenant_id' => $other->tenant_id, 'role_id' => $role->id]));
        $this->postJson('/api/v1/categories', ['name' => 'Sin permiso', 'color' => '#8271FF', 'is_active' => true])->assertForbidden();
        $this->assertDatabaseHas('categories', ['id' => $root['id'], 'tenant_id' => $first->tenant_id, 'parent_id' => null]);
    }

    public function test_composite_foreign_key_rejects_parent_from_another_company(): void
    {
        $this->owner();
        $root = $this->category('Platos');
        $this->owner('fk-hierarchy@example.test');
        $other = $this->category('Bebidas');
        $this->expectException(QueryException::class);
        DB::table('categories')->where('id', $root['id'])->update(['parent_id' => $other['id']]);
    }

    public function test_failed_audit_rolls_back_parent_and_revision_together(): void
    {
        $this->owner();
        $root = $this->category('Platos');
        $child = $this->category('Pizzas', $root);
        $other = $this->category('Bebidas');
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'catalog.category.updated') {
                throw new \RuntimeException('Auditoría de categoría fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->putJson('/api/v1/categories/'.$child['id'], $this->edit($child, ['parent_id' => $other['id'], 'parent_revision' => 1]));
            $this->fail('La organización exige auditoría atómica.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de categoría fallida', $error->getMessage());
        }
        $this->assertDatabaseHas('categories', ['id' => $child['id'], 'parent_id' => $root['id'], 'revision' => 1]);
    }
}
