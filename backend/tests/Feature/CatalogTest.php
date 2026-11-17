<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Category;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CatalogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function owner(string $email = 'catalog@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function category(User $user, string $name = 'Pizzas'): Category
    {
        return app(TenantContext::class)->run($user->tenant_id, fn () => Category::create(['name' => $name, 'color' => '#8271FF']))->refresh();
    }

    private function payload(int $categoryId, string $sku = 'PIZZA-01'): array
    {
        return ['name' => 'Pizza Margarita', 'sku' => $sku, 'category_id' => $categoryId, 'sale_price' => '28900.1250', 'cost_price' => '8100.0025', 'currency' => 'COP', 'is_active' => true, 'is_available' => true];
    }

    public function test_category_and_product_are_persisted_with_exact_decimal_prices_and_audited(): void
    {
        $this->actingAs($this->owner());
        $id = $this->postJson('/api/v1/categories', ['name' => 'Pizzas', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $this->postJson('/api/v1/products', $this->payload($id))->assertCreated()->assertJsonPath('data.sale_price', '28900.1250')->assertJsonPath('data.cost_price', '8100.0025')->assertJsonPath('data.revision', 1);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.product.created']);
        $this->getJson('/api/v1/categories')->assertOk()->assertJsonPath('data.0.products_count', 1);
    }

    public function test_lists_search_filter_and_paginate_on_server(): void
    {
        $owner = $this->owner();
        $category = $this->category($owner);
        $other = $this->category($owner, 'Bebidas');
        $this->actingAs($owner);
        $this->postJson('/api/v1/products', $this->payload($category->id))->assertCreated();
        $this->postJson('/api/v1/products', [...$this->payload($other->id, 'CAFE-01'), 'name' => 'Café especial', 'barcode' => '770123', 'is_available' => false])->assertCreated();
        $this->getJson('/api/v1/products?per_page=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2)->assertJsonPath('meta.last_page', 2);
        $this->getJson('/api/v1/products?search=770123')->assertOk()->assertJsonPath('data.0.sku', 'CAFE-01');
        $this->getJson('/api/v1/products?category_id='.$category->id)->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/products?availability=unavailable')->assertJsonCount(1, 'data')->assertJsonPath('data.0.sellable', false);
        $this->getJson('/api/v1/products?per_page=5000')->assertUnprocessable();
        $this->getJson('/api/v1/products?search=%25')->assertJsonCount(0, 'data');
    }

    public function test_company_cannot_read_edit_or_reference_foreign_catalog(): void
    {
        $a = $this->owner();
        $b = $this->owner('b@example.test');
        $category = $this->category($b);
        $this->actingAs($b);
        $foreign = $this->postJson('/api/v1/products', $this->payload($category->id))->assertCreated()->json('data.id');
        $this->actingAs($a);
        $this->getJson('/api/v1/products')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/categories')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/products/'.$foreign)->assertNotFound();
        $this->putJson('/api/v1/products/'.$foreign, [...$this->payload($category->id), 'revision' => 1])->assertNotFound();
        $this->putJson('/api/v1/categories/'.$category->id, ['name' => 'Intrusión', 'color' => '#000000', 'is_active' => false, 'revision' => 1])->assertNotFound();
        $this->postJson('/api/v1/products', $this->payload($category->id))->assertUnprocessable()->assertJsonValidationErrors('category_id');
    }

    public function test_database_rejects_cross_company_product_category(): void
    {
        $a = $this->owner();
        $b = $this->owner('b@example.test');
        $category = $this->category($b);
        $this->expectException(QueryException::class);
        $data = $this->payload($category->id);
        unset($data['currency']);
        DB::table('products')->insert([...$data, 'tenant_id' => $a->tenant_id]);
    }

    public function test_skus_barcodes_and_category_names_are_unique_within_each_company(): void
    {
        $a = $this->owner();
        $category = $this->category($a);
        $this->actingAs($a);
        $this->postJson('/api/v1/products', [...$this->payload($category->id), 'barcode' => '7701'])->assertCreated();
        $this->postJson('/api/v1/products', $this->payload($category->id))->assertUnprocessable()->assertJsonValidationErrors('sku');
        $this->postJson('/api/v1/products', [...$this->payload($category->id, 'OTHER'), 'barcode' => '7701'])->assertUnprocessable()->assertJsonValidationErrors('barcode');
        $this->postJson('/api/v1/categories', ['name' => 'Pizzas', 'color' => '#000000', 'is_active' => true])->assertUnprocessable();
        $b = $this->owner('b@example.test');
        $other = $this->category($b);
        $this->actingAs($b)->postJson('/api/v1/products', [...$this->payload($other->id), 'barcode' => '7701'])->assertCreated();
    }

    public function test_costs_are_hidden_and_protected_from_catalog_reader_and_non_cost_manager(): void
    {
        $owner = $this->owner();
        $category = $this->category($owner);
        $id = $this->actingAs($owner)->postJson('/api/v1/products', $this->payload($category->id))->json('data.id');
        $manager = app(TenantContext::class)->run($owner->tenant_id, function () {
            $role = Role::where('name', 'Mesero')->firstOrFail();
            $role->permissions()->syncWithPivotValues(Permission::whereIn('key', ['catalog.view', 'catalog.manage'])->pluck('id'), ['tenant_id' => $role->tenant_id]);

            return User::factory()->create(['role_id' => $role->id]);
        });
        $this->actingAs($manager);
        $this->getJson('/api/v1/products')->assertOk()->assertJsonMissingPath('data.0.cost_price');
        $this->getJson('/api/v1/products/'.$id)->assertOk()->assertJsonMissingPath('data.cost_price');
        $this->putJson('/api/v1/products/'.$id, [...$this->payload($category->id), 'revision' => 1])->assertUnprocessable()->assertJsonValidationErrors('cost_price');
        $data = $this->payload($category->id);
        unset($data['cost_price']);
        $this->putJson('/api/v1/products/'.$id, [...$data, 'sale_price' => '30000', 'revision' => 1])->assertOk()->assertJsonMissingPath('data.cost_price');
        $this->assertDatabaseHas('products', ['id' => $id, 'cost_price' => '8100.0025']);
    }

    public function test_role_without_catalog_access_cannot_list_or_write(): void
    {
        $owner = $this->owner();
        $category = $this->category($owner);
        $user = app(TenantContext::class)->run($owner->tenant_id, fn () => User::factory()->create());
        $this->actingAs($user)->getJson('/api/v1/products')->assertForbidden();
        $this->getJson('/api/v1/categories')->assertForbidden();
        $this->postJson('/api/v1/products', $this->payload($category->id))->assertForbidden();
        $this->postJson('/api/v1/categories', ['name' => 'No', 'color' => '#000000', 'is_active' => true])->assertForbidden();
    }

    public function test_money_validation_rejects_floats_negative_overflow_and_injection(): void
    {
        $owner = $this->owner();
        $category = $this->category($owner);
        $this->actingAs($owner);
        foreach ([-1, 28.5, '-2', '1e4', '28.12345', '1000000000000000', '28,5', '<script>'] as $bad) {
            $this->postJson('/api/v1/products', [...$this->payload($category->id), 'sale_price' => $bad])->assertUnprocessable()->assertJsonValidationErrors('sale_price');
        }
        $this->postJson('/api/v1/products', [...$this->payload($category->id), 'tenant_id' => $owner->tenant_id])->assertUnprocessable()->assertJsonValidationErrors('tenant_id');
        $this->assertDatabaseCount('products', 0);
    }

    public function test_stale_product_and_category_updates_do_not_overwrite_changes(): void
    {
        $owner = $this->owner();
        $category = $this->category($owner);
        $this->actingAs($owner);
        $id = $this->postJson('/api/v1/products', $this->payload($category->id))->json('data.id');
        $data = [...$this->payload($category->id), 'revision' => 1];
        $this->putJson('/api/v1/products/'.$id, [...$data, 'sale_price' => '31000'])->assertOk()->assertJsonPath('data.revision', 2);
        $this->putJson('/api/v1/products/'.$id, [...$data, 'sale_price' => '1'])->assertConflict();
        $this->getJson('/api/v1/products/'.$id)->assertJsonPath('data.sale_price', '31000.0000');
        $data = ['name' => 'Pizzas', 'color' => '#8271FF', 'is_active' => false, 'revision' => 1];
        $this->putJson('/api/v1/categories/'.$category->id, $data)->assertOk()->assertJsonPath('revision', 2);
        $this->putJson('/api/v1/categories/'.$category->id, $data)->assertConflict();
        $this->getJson('/api/v1/products/'.$id)->assertJsonPath('data.sellable', false);
        $this->assertDatabaseCount('products', 1);
    }

    public function test_currency_cannot_reinterpret_existing_catalog_prices(): void
    {
        $owner = $this->owner();
        $category = $this->category($owner);
        $this->actingAs($owner)->postJson('/api/v1/products', $this->payload($category->id))->assertCreated();
        $this->putJson('/api/v1/workspace/company', ['name' => 'Oliva', 'business_type' => 'restaurant', 'currency' => 'USD', 'timezone' => 'America/Bogota', 'locale' => 'es-CO'])->assertUnprocessable()->assertJsonValidationErrors('currency');
        $this->assertDatabaseHas('tenants', ['id' => $owner->tenant_id, 'currency' => 'COP']);
    }

    public function test_creation_rejects_stale_currency_before_any_product_exists(): void
    {
        $owner = $this->owner();
        $category = $this->category($owner);
        $this->actingAs($owner);
        $this->putJson('/api/v1/workspace/company', ['name' => 'Oliva', 'business_type' => 'restaurant', 'currency' => 'USD', 'timezone' => 'America/Bogota', 'locale' => 'es-CO'])->assertOk();
        $this->postJson('/api/v1/products', $this->payload($category->id))->assertConflict();
        $this->assertDatabaseCount('products', 0);
        $this->postJson('/api/v1/products', [...$this->payload($category->id), 'currency' => 'USD'])->assertCreated();
    }
}
