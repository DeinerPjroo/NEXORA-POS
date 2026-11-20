<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class ProductGalleryTest extends TestCase
{
    // Se ejecutan afterCommit reales para comprobar limpieza; TestCase protege la base aislada.
    use DatabaseTruncation;

    private User $owner;

    private array $product;

    private string $path;

    protected function beforeTruncatingDatabase(): void
    {
        // SQLite :memory: no comparte PDO entre aplicaciones sin RefreshDatabase.
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            // SQL conserva el esquema: limpiar filas al terminar evita contaminar clases
            // RefreshDatabase posteriores sin reconstruir todas las migraciones por caso.
            $this->beforeApplicationDestroyed(function () {
                $name = DB::getDatabaseName();
                if (! preg_match('/^nexora_test_[a-f0-9]{16}$/D', $name) || getenv('NEXORA_ISOLATED_DATABASE') !== $name) {
                    throw new \LogicException('La limpieza de galería exige el esquema SQL aislado.');
                }
                $this->truncateTablesForAllConnections();
            });

            return;
        }
        RefreshDatabaseState::$migrated = false;
        $this->beforeApplicationDestroyed(function () {
            RefreshDatabaseState::$migrated = false;
        });
    }

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        Storage::fake('catalog');
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'gallery@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($this->owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Carta', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $this->product = $this->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $category, 'sale_price' => '10', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->path = '/api/v1/products/'.$this->product['id'];
    }

    private function payload(array $changes = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'product_revision' => (int) DB::table('products')->where('id', $this->product['id'])->value('revision'), 'currency' => 'COP', ...$changes];
    }

    private function upload(int $size = 64, array $changes = []): array
    {
        return $this->post($this->path.'/images', [...$this->payload($changes), 'image' => UploadedFile::fake()->image('photo.png', $size, $size)], ['Accept' => 'application/json'])->assertCreated()->json('data');
    }

    public function test_backfill_preserves_old_cover_url_file_and_revision_without_duplicate_rows(): void
    {
        $path = 'tenants/'.$this->owner->tenant_id.'/products/'.$this->product['id'].'/legacy.png';
        $file = UploadedFile::fake()->image('old.png', 64, 64);
        Storage::disk('catalog')->put($path, $file->getContent());
        DB::table('products')->where('id', $this->product['id'])->update(['image_path' => $path, 'image_mime' => 'image/png']);
        $migration = require database_path('migrations/2026_11_19_000022_add_private_product_gallery.php');
        $migration->backfill();
        $migration->backfill();
        $this->getJson($this->path)->assertJsonPath('data.revision', 1)->assertJsonPath('data.image_url', $this->path.'/image?version='.substr(hash('sha256', $path), 0, 16));
        $image = $this->getJson($this->path.'/images')->assertOk()->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.path')->assertJsonMissingPath('data.0.tenant_id')->json('data.0');
        $this->get($image['image_url'])->assertOk()->assertHeader('Content-Type', 'image/png')->assertHeader('X-Content-Type-Options', 'nosniff');
        Storage::disk('catalog')->assertExists($path);
        $this->assertDatabaseCount('product_images', 1);
    }

    public function test_upload_reencodes_private_bytes_and_replays_by_server_file_hash_without_duplicate_files(): void
    {
        $source = UploadedFile::fake()->image('photo.png', 64, 64)->getContent();
        $file = UploadedFile::fake()->createWithContent('photo.png', $source.'<?php forbidden_gallery(); ?>');
        $body = [...$this->payload(), 'image' => $file];
        $image = $this->post($this->path.'/images', $body, ['Accept' => 'application/json'])->assertCreated()->json('data');
        $this->post($this->path.'/images', $body, ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.id', $image['id']);
        $this->assertCount(1, Storage::disk('catalog')->allFiles());
        $response = $this->get($image['image_url'])->assertOk()->assertHeader('Content-Type', 'image/png')->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('private', $response->headers->get('Cache-Control'));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $this->assertStringNotContainsString('forbidden_gallery', $response->streamedContent());
        $this->post($this->path.'/images', [...$body, 'image' => UploadedFile::fake()->image('photo.png', 80, 80)], ['Accept' => 'application/json'])->assertConflict();
        $this->assertDatabaseCount('product_images', 1);
        $this->getJson($this->path.'/images')->assertJsonPath('product_revision', 2)->assertJsonPath('cover_image_id', $image['id']);
        $other = $this->upload(80);
        $this->getJson($this->path.'/images')->assertJsonPath('cover_image_id', $image['id'])->assertJsonCount(2, 'data');
        $this->assertNotSame($image['id'], $other['id']);
    }

    public function test_cover_order_and_removal_keep_mirror_and_cleanup_only_after_commit(): void
    {
        $first = $this->upload();
        $second = $this->upload(80);
        $third = $this->upload(96);
        $this->putJson($this->path.'/images/order', [...$this->payload(), 'image_ids' => [$third['id'], $first['id'], $second['id']]])->assertOk();
        $this->getJson($this->path.'/images')->assertJsonPath('data.0.id', $third['id'])->assertJsonPath('data.2.position', 2)->assertJsonPath('cover_image_id', $first['id']);
        $this->putJson($this->path.'/images/'.$second['id'].'/cover', $this->payload())->assertOk()->assertJsonPath('data.cover_image_id', $second['id']);
        $oldPath = DB::table('product_images')->where('id', $second['id'])->value('path');
        $this->assertSame($oldPath, DB::table('products')->where('id', $this->product['id'])->value('image_path'));
        $body = $this->payload();
        $this->deleteJson($this->path.'/images/'.$second['id'], $body)->assertOk()->assertJsonPath('data.cover_image_id', $third['id']);
        $this->deleteJson($this->path.'/images/'.$second['id'], $body)->assertOk();
        Storage::disk('catalog')->assertMissing($oldPath);
        $this->get($second['image_url'])->assertNotFound();
        $this->getJson($this->path.'/images')->assertJsonCount(2, 'data')->assertJsonPath('data.1.position', 1);
        $this->deleteJson($this->path.'/images/'.$third['id'], $this->payload())->assertOk()->assertJsonPath('data.cover_image_id', $first['id']);
        $this->deleteJson($this->path.'/images/'.$first['id'], $this->payload())->assertOk()->assertJsonPath('data.cover_image_id', null);
        $this->getJson($this->path)->assertJsonPath('data.image_url', null);
        $this->assertCount(0, Storage::disk('catalog')->allFiles());
        $this->assertDatabaseCount('product_images', 3);
    }

    public function test_invalid_files_order_stale_writes_currency_and_limit_leave_existing_images_intact(): void
    {
        foreach ([UploadedFile::fake()->createWithContent('bad.svg', '<svg><script>bad()</script></svg>'), UploadedFile::fake()->image('tiny.png', 10, 10), UploadedFile::fake()->image('big.png', 64, 64)->size(2049)] as $file) {
            $this->post($this->path.'/images', [...$this->payload(), 'image' => $file], ['Accept' => 'application/json'])->assertUnprocessable();
        }
        $first = $this->upload();
        $this->post($this->path.'/images', [...$this->payload(['product_revision' => 1]), 'image' => UploadedFile::fake()->image('photo.png', 64, 64)], ['Accept' => 'application/json'])->assertConflict();
        $this->putJson($this->path.'/images/'.$first['id'].'/cover', $this->payload(['currency' => 'USD']))->assertConflict();
        $this->putJson($this->path.'/images/order', [...$this->payload(), 'image_ids' => [$first['id'], $first['id']]])->assertUnprocessable();
        $this->putJson($this->path.'/images/order', [...$this->payload(), 'image_ids' => [999]])->assertConflict();
        for ($index = 0; $index < 7; $index++) {
            $this->upload();
        }
        $this->post($this->path.'/images', [...$this->payload(), 'image' => UploadedFile::fake()->image('ninth.png', 64, 64)], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertCount(8, Storage::disk('catalog')->allFiles());
        $this->getJson($this->path.'/images?per_page=3')->assertJsonCount(3, 'data')->assertJsonPath('meta.total', 8);
    }

    public function test_legacy_replace_and_remove_preserve_other_gallery_photos_and_cover_contract(): void
    {
        $first = $this->upload();
        $second = $this->upload(80);
        $path = DB::table('product_images')->where('id', $first['id'])->value('path');
        $this->post($this->path.'/image', ['revision' => 3, 'image' => UploadedFile::fake()->image('replacement.png', 96, 96)], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.revision', 4);
        Storage::disk('catalog')->assertMissing($path);
        $this->getJson($this->path.'/images')->assertJsonCount(2, 'data');
        $this->deleteJson($this->path.'/image', ['revision' => 4])->assertOk()->assertJsonPath('data.revision', 5);
        $this->getJson($this->path.'/images')->assertJsonCount(1, 'data')->assertJsonPath('cover_image_id', $second['id']);
        $this->get($second['image_url'])->assertOk();
    }

    public function test_audit_failure_rolls_back_photo_cover_revision_uuid_and_cleans_new_blob(): void
    {
        $before = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'catalog.gallery.uploaded') {
                throw new \RuntimeException('Auditoría requerida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->upload();
            $this->fail('Debe revertir.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría requerida', $error->getMessage());
        }
        $this->assertDatabaseCount('product_images', 0);
        $this->assertDatabaseCount('idempotency_records', $before);
        $this->assertDatabaseHas('products', ['id' => $this->product['id'], 'revision' => 1, 'cover_image_id' => null]);
        $this->assertCount(0, Storage::disk('catalog')->allFiles());
    }

    public function test_photo_bindings_tenant_reader_permissions_and_replay_revocation_are_enforced(): void
    {
        $body = [...$this->payload(), 'image' => UploadedFile::fake()->image('photo.png', 64, 64)];
        $image = $this->post($this->path.'/images', $body, ['Accept' => 'application/json'])->assertCreated()->json('data');
        $other = $this->postJson('/api/v1/products', ['category_id' => $this->product['category_id'], 'name' => 'Otra', 'sku' => 'OTRA', 'sale_price' => '1', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->get('/api/v1/products/'.$other['id'].'/images/'.$image['id'])->assertNotFound();
        $this->putJson('/api/v1/products/'.$other['id'].'/images/'.$image['id'].'/cover', $this->payload())->assertNotFound();
        $role = DB::table('roles')->where('tenant_id', $this->owner->tenant_id)->where('name', 'Encargado de inventario')->first();
        DB::table('role_permission')->insert(['tenant_id' => $this->owner->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'catalog.view')->value('id')]);
        $this->actingAs(User::factory()->create(['tenant_id' => $this->owner->tenant_id, 'role_id' => $role->id]));
        $this->getJson($this->path.'/images')->assertOk();
        $this->get($image['image_url'])->assertOk();
        $this->putJson($this->path.'/images/'.$image['id'].'/cover', $this->payload())->assertForbidden();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'catalog.manage')->value('id'))->delete();
        $this->actingAs($this->owner->fresh());
        $this->post($this->path.'/images', $body, ['Accept' => 'application/json'])->assertForbidden();
        $foreign = app(RegisterCompany::class)->execute(['company_name' => 'Otra', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Eva', 'email' => 'foreign-gallery@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($foreign);
        $this->get($image['image_url'])->assertNotFound();
        $this->getJson($this->path.'/images')->assertNotFound();
    }

    public function test_cover_fk_rejects_photo_of_another_product(): void
    {
        $image = $this->upload();
        $other = $this->postJson('/api/v1/products', ['category_id' => $this->product['category_id'], 'name' => 'Otra', 'sku' => 'OTRA', 'sale_price' => '1', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->expectException(QueryException::class);
        DB::table('products')->where('id', $other['id'])->update(['cover_image_id' => $image['id']]);
    }
}
