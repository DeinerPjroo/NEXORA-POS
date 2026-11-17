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
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CatalogMediaVariantsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        Storage::fake('catalog');
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function owner(string $email = 'media@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function product(User $owner, string $sku = 'PIZZA'): array
    {
        $category = app(TenantContext::class)->run($owner->tenant_id, fn () => Category::firstOrCreate(['name' => 'Pizzas'], ['color' => '#8271FF']));

        return $this->actingAs($owner)->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => $sku, 'category_id' => $category->id, 'sale_price' => '25000', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
    }

    private function variant(array $changes = []): array
    {
        return [...['name' => 'Grande', 'sku' => 'PIZZA-G', 'barcode' => '770123', 'sale_price' => '38900.1250', 'cost_price' => '9500.0025', 'currency' => 'COP', 'product_revision' => 1, 'is_active' => true, 'is_available' => true], ...$changes];
    }

    public function test_private_photo_is_reencoded_readable_and_does_not_expose_storage_path(): void
    {
        $owner = $this->owner();
        $product = $this->product($owner);
        $source = UploadedFile::fake()->image('original.png', 64, 64);
        $file = UploadedFile::fake()->createWithContent('photo.png', $source->getContent().'<?php forbidden_payload(); ?>');
        $response = $this->post('/api/v1/products/'.$product['id'].'/image', ['revision' => 1, 'image' => $file], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.revision', 2)->assertJsonMissingPath('data.image_path');
        $url = $response->json('data.image_url');
        $this->assertStringStartsWith('/api/v1/products/'.$product['id'].'/image?version=', $url);
        $image = $this->get($url)->assertOk()->assertHeader('Content-Type', 'image/png')->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringNotContainsString('forbidden_payload', $image->streamedContent());
        $this->assertCount(1, Storage::disk('catalog')->allFiles());
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.image.saved']);
    }

    public function test_upload_rejects_svg_wrong_dimensions_and_files_over_limit(): void
    {
        $product = $this->product($this->owner());
        foreach ([UploadedFile::fake()->createWithContent('attack.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), UploadedFile::fake()->image('small.png', 10, 10), UploadedFile::fake()->image('large.png', 64, 64)->size(2049)] as $file) {
            $this->post('/api/v1/products/'.$product['id'].'/image', ['revision' => 1, 'image' => $file], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('image');
        }
        $this->assertCount(0, Storage::disk('catalog')->allFiles());
    }

    public function test_private_image_is_not_accessible_after_logout(): void
    {
        $product = $this->product($this->owner());
        $url = $this->post('/api/v1/products/'.$product['id'].'/image', ['revision' => 1, 'image' => UploadedFile::fake()->image('photo.png', 64, 64)], ['Accept' => 'application/json'])->assertOk()->json('data.image_url');
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        // Simular el nuevo ciclo HTTP: RequestGuard de Sanctum conserva usuario en la instancia de pruebas.
        $this->app['auth']->forgetGuards();
        $this->get($url)->assertUnauthorized();
    }

    public function test_stale_photo_upload_leaves_no_orphan_and_photo_can_be_removed(): void
    {
        $product = $this->product($this->owner());
        $url = '/api/v1/products/'.$product['id'].'/image';
        $first = $this->post($url, ['revision' => 1, 'image' => UploadedFile::fake()->image('one.jpg', 64, 64)], ['Accept' => 'application/json'])->assertOk()->json('data.image_url');
        $this->post($url, ['revision' => 1, 'image' => UploadedFile::fake()->image('two.jpg', 64, 64)], ['Accept' => 'application/json'])->assertConflict();
        $this->assertCount(1, Storage::disk('catalog')->allFiles());
        $this->getJson('/api/v1/products/'.$product['id'])->assertJsonPath('data.image_url', $first);
        $this->deleteJson($url, ['revision' => 2])->assertOk()->assertJsonPath('data.image_url', null)->assertJsonPath('data.revision', 3);
        $this->get($url)->assertNotFound();
    }

    public function test_foreign_company_cannot_read_upload_remove_photos_or_change_variants(): void
    {
        $a = $this->owner();
        $product = $this->product($a);
        $variant = $this->postJson('/api/v1/products/'.$product['id'].'/variants', $this->variant())->assertCreated()->json('data.id');
        $b = $this->owner('other@example.test');
        $this->actingAs($b);
        $base = '/api/v1/products/'.$product['id'];
        $this->get($base.'/image')->assertNotFound();
        $this->post($base.'/image', ['revision' => 2, 'image' => UploadedFile::fake()->image('photo.png', 64, 64)], ['Accept' => 'application/json'])->assertNotFound();
        $this->deleteJson($base.'/image', ['revision' => 2])->assertNotFound();
        $this->getJson($base.'/variants')->assertNotFound();
        $this->putJson($base.'/variants/'.$variant, $this->variant(['product_revision' => 2]))->assertNotFound();
    }

    public function test_variants_keep_exact_prices_and_advance_parent_revision(): void
    {
        $product = $this->product($this->owner());
        $base = '/api/v1/products/'.$product['id'];
        $this->postJson($base.'/variants', $this->variant())->assertCreated()->assertJsonPath('data.sale_price', '38900.1250')->assertJsonPath('data.cost_price', '9500.0025');
        $this->getJson($base)->assertJsonPath('data.revision', 2)->assertJsonPath('data.variants_count', 1)->assertJsonPath('data.available_variants_count', 1);
        $this->getJson($base.'/variants?per_page=1')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('product_revision', 2);
        $this->postJson($base.'/variants', $this->variant(['name' => 'Personal', 'sku' => 'PIZZA-P', 'barcode' => null]))->assertConflict();
        $this->assertDatabaseCount('product_variants', 1);
    }

    public function test_codes_cannot_collide_between_products_and_variants(): void
    {
        $owner = $this->owner();
        $product = $this->product($owner);
        $base = '/api/v1/products/'.$product['id'];
        $this->postJson($base.'/variants', $this->variant(['sku' => 'PIZZA']))->assertUnprocessable()->assertJsonValidationErrors('sku');
        $this->postJson($base.'/variants', $this->variant())->assertCreated();
        $categoryId = $product['category_id'];
        $data = ['name' => 'Otro', 'sku' => 'PIZZA-G', 'category_id' => $categoryId, 'sale_price' => '1', 'currency' => 'COP', 'is_active' => true, 'is_available' => true];
        $this->postJson('/api/v1/products', $data)->assertUnprocessable()->assertJsonValidationErrors('sku');
        $this->postJson('/api/v1/products', [...$data, 'sku' => 'OTHER', 'barcode' => '770123'])->assertUnprocessable()->assertJsonValidationErrors('barcode');
        $this->assertDatabaseCount('products', 1);
    }

    public function test_variant_of_another_product_cannot_be_changed_and_archival_is_preserved(): void
    {
        $owner = $this->owner();
        $a = $this->product($owner);
        $b = $this->product($owner, 'OTHER');
        $id = $this->postJson('/api/v1/products/'.$a['id'].'/variants', $this->variant())->assertCreated()->json('data.id');
        $this->putJson('/api/v1/products/'.$b['id'].'/variants/'.$id, $this->variant())->assertNotFound();
        $this->putJson('/api/v1/products/'.$a['id'].'/variants/'.$id, $this->variant(['product_revision' => 2, 'is_active' => false]))->assertOk();
        $this->getJson('/api/v1/products/'.$a['id'])->assertJsonPath('data.sellable', false)->assertJsonPath('data.revision', 3);
        $this->assertDatabaseCount('product_variants', 1);
    }

    public function test_variant_costs_and_image_mutations_respect_permissions(): void
    {
        $owner = $this->owner();
        $product = $this->product($owner);
        $this->postJson('/api/v1/products/'.$product['id'].'/variants', $this->variant())->assertCreated();
        $reader = app(TenantContext::class)->run($owner->tenant_id, function () {
            $role = Role::where('name', 'Mesero')->firstOrFail();
            $role->permissions()->syncWithPivotValues(Permission::where('key', 'catalog.view')->pluck('id'), ['tenant_id' => $role->tenant_id]);

            return User::factory()->create(['role_id' => $role->id]);
        });
        $this->actingAs($reader);
        $this->getJson('/api/v1/products/'.$product['id'].'/variants')->assertOk()->assertJsonMissingPath('data.0.cost_price');
        $this->postJson('/api/v1/products/'.$product['id'].'/variants', $this->variant(['product_revision' => 2]))->assertForbidden();
        $this->post('/api/v1/products/'.$product['id'].'/image', ['revision' => 2, 'image' => UploadedFile::fake()->image('photo.png', 64, 64)], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_database_rejects_variant_link_to_foreign_company_product(): void
    {
        $a = $this->owner();
        $product = $this->product($a);
        $b = $this->owner('other@example.test');
        $data = $this->variant();
        unset($data['currency'], $data['product_revision']);
        $this->expectException(QueryException::class);
        DB::table('product_variants')->insert([...$data, 'tenant_id' => $b->tenant_id, 'product_id' => $product['id']]);
    }
}
