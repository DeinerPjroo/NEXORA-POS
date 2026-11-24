<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Studio\PosLayoutSchema;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\StudioLayout;
use App\Models\StudioLayoutVersion;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class StudioVersionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('versions@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Versiones', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function scope(callable $callback): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $callback);
    }

    private function save(int $revision, int $width = 480): array
    {
        $config = PosLayoutSchema::defaults();
        $config['tokens']['order_width'] = $width;

        return $this->postJson('/api/v1/studio/pos/draft', [...$this->key(), 'revision' => $revision, 'configuration' => $config])->assertOk()->json('data');
    }

    private function versions(): array
    {
        return $this->getJson('/api/v1/studio/pos/versions?archived=1')->assertOk()->json('data');
    }

    private function body(int $revision, int $version): array
    {
        return [...$this->key(), 'revision' => $revision, 'version_id' => $version, 'reason' => 'Cambio solicitado por el administrador'];
    }

    public function test_studio_versions_restore_as_draft_archive_without_deleting_and_preserve_runtime_until_publication(): void
    {
        $this->getJson('/api/v1/studio/pos/versions')->assertOk()->assertJsonPath('meta.total', 0);
        $this->save(0);
        $first = $this->versions()[0];
        $this->postJson('/api/v1/studio/pos/publish', [...$this->key(), 'revision' => 1])->assertOk();
        $this->save(2, 420);
        $this->postJson('/api/v1/studio/pos/publish', [...$this->key(), 'revision' => 3])->assertOk();
        $this->getJson('/api/v1/studio/pos/versions')->assertJsonPath('meta.total', 4)->assertJsonPath('data.0.author', 'Ana')->assertJsonPath('data.0.current_published', true);
        $body = $this->body(4, $first['id']);
        $this->postJson('/api/v1/studio/pos/restore', $body)->assertOk()->assertJsonPath('data.revision', 5)->assertJsonPath('data.draft.tokens.order_width', 480)->assertJsonPath('data.published.tokens.order_width', 420);
        $this->postJson('/api/v1/studio/pos/restore', $body)->assertOk();
        $this->postJson('/api/v1/studio/pos/restore', [...$body, 'reason' => 'Otro contenido'])->assertConflict();
        $this->postJson('/api/v1/studio/pos/restore', $this->body(4, $first['id']))->assertConflict();
        $this->getJson('/api/v1/studio/pos/active')->assertJsonPath('data.configuration.tokens.order_width', 420);
        $rows = $this->versions();
        $this->postJson('/api/v1/studio/pos/archive', $this->body(5, $rows[0]['id']))->assertConflict();
        $this->postJson('/api/v1/studio/pos/archive', $this->body(5, $rows[1]['id']))->assertConflict();
        $archive = $this->body(5, $first['id']);
        $this->postJson('/api/v1/studio/pos/archive', $archive)->assertOk()->assertJsonPath('data.revision', 6);
        $this->postJson('/api/v1/studio/pos/archive', $archive)->assertOk();
        $this->getJson('/api/v1/studio/pos/versions')->assertJsonPath('meta.total', 4);
        $this->getJson('/api/v1/studio/pos/versions?archived=1')->assertJsonPath('meta.total', 5);
        $this->postJson('/api/v1/studio/pos/restore', $this->body(6, $first['id']))->assertOk()->assertJsonPath('data.draft_revision', 7);
        $this->postJson('/api/v1/studio/pos/publish', [...$this->key(), 'revision' => 7])->assertOk();
        $this->getJson('/api/v1/studio/pos/active')->assertJsonPath('data.configuration.tokens.order_width', 480);
        $this->assertDatabaseCount('studio_layout_versions', 7);
        $this->assertDatabaseCount('studio_version_archives', 1);
        $this->scope(fn () => $this->assertSame($first['configuration'], StudioLayoutVersion::findOrFail($first['id'])->configuration));
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_studio_version_permissions_tenants_and_invalid_snapshots_are_enforced(): void
    {
        $this->save(0);
        $first = $this->versions()[0];
        $staff = $this->scope(function () {
            $role = Role::create(['name' => 'Editor Studio', 'is_owner' => false]);
            $role->permissions()->attach(Permission::whereIn('key', ['studio.view', 'studio.edit'])->pluck('id'), ['tenant_id' => $this->owner->tenant_id]);

            return User::factory()->create(['role_id' => $role->id]);
        });
        $this->actingAs($staff);
        $body = $this->body(1, $first['id']);
        $this->postJson('/api/v1/studio/pos/restore', $body)->assertOk();
        $this->postJson('/api/v1/studio/pos/publish', [...$this->key(), 'revision' => 2])->assertForbidden();
        $this->scope(fn () => $staff->role->permissions()->detach(Permission::where('key', 'studio.edit')->value('id')));
        $staff->unsetRelation('role');
        $this->actingAs($staff);
        $this->postJson('/api/v1/studio/pos/restore', $body)->assertForbidden();
        $this->getJson('/api/v1/studio/pos/versions')->assertOk();
        $other = $this->company('other-version@example.test');
        $this->actingAs($other);
        $this->save(0);
        $this->postJson('/api/v1/studio/pos/restore', $this->body(1, $first['id']))->assertNotFound();
        $this->getJson('/api/v1/studio/pos/versions')->assertJsonPath('meta.total', 1);
        $this->actingAs($this->owner);
        $invalid = $this->scope(fn () => StudioLayoutVersion::create(['studio_layout_id' => StudioLayout::firstOrFail()->id, 'revision' => 999, 'kind' => 'draft', 'configuration' => ['schema_version' => 999, 'html' => '<script>alert(1)</script>'], 'actor_id' => $this->owner->id, 'created_at' => now()]));
        $this->postJson('/api/v1/studio/pos/restore', $this->body(2, $invalid->id))->assertUnprocessable();
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data.revision', 2);
    }

    public function test_studio_version_audit_failure_rolls_back_restore_archive_and_idempotency(): void
    {
        $this->save(0);
        $first = $this->versions()[0];
        $this->save(1, 420);
        $fail = true;
        AuditLog::creating(function ($log) use (&$fail) {
            if ($fail && in_array($log->action, ['studio.version.restored', 'studio.version.archived'])) {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $body = $this->body(2, $first['id']);
        $this->postJson('/api/v1/studio/pos/restore', $body)->assertServerError();
        $this->assertDatabaseCount('studio_layout_versions', 2);
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data.revision', 2)->assertJsonPath('data.draft.tokens.order_width', 420);
        $this->postJson('/api/v1/studio/pos/archive', $body)->assertServerError();
        $this->assertDatabaseCount('studio_version_archives', 0);
        $fail = false;
        $this->postJson('/api/v1/studio/pos/restore', $body)->assertOk();
        $this->assertDatabaseCount('studio_layout_versions', 3);
    }

    public function test_studio_version_migration_preserves_existing_snapshots_authors_and_dates_without_fabricating_history(): void
    {
        $config = PosLayoutSchema::defaults();
        $past = now()->subDay()->startOfSecond();
        $row = $this->scope(fn () => StudioLayout::create(['surface' => 'pos', 'revision' => 2, 'draft' => $config, 'published' => $config, 'published_revision' => 2, 'updated_by' => $this->owner->id, 'published_by' => $this->owner->id, 'published_at' => $past, 'created_at' => $past, 'updated_at' => $past]));
        $migration = require database_path('migrations/2026_11_24_000037_add_studio_versions.php');
        $migration->backfill();
        $migration->backfill();
        $this->assertDatabaseCount('studio_layout_versions', 1);
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data.draft_revision', 2)->assertJsonPath('data.published_revision', 2)->assertJsonPath('data.draft', $config);
        $this->scope(function () use ($row, $past) {
            $v = StudioLayoutVersion::firstOrFail();
            $this->assertSame($row->id, $v->studio_layout_id);
            $this->assertSame($this->owner->id, $v->actor_id);
            $this->assertTrue($v->created_at->equalTo($past));
        });
    }

    public function test_studio_version_composite_foreign_keys_reject_cross_company_archive(): void
    {
        $this->save(0);
        $first = $this->versions()[0];
        $other = $this->company('foreign-fk@example.test');
        $this->actingAs($other);
        $row = $this->save(0);
        $this->expectException(QueryException::class);
        DB::table('studio_version_archives')->insert(['tenant_id' => $other->tenant_id, 'studio_layout_id' => $row['id'], 'studio_layout_version_id' => $first['id'], 'actor_id' => $other->id, 'reason' => 'Referencia ajena', 'created_at' => now()]);
    }
}
