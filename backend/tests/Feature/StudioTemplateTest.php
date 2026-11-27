<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Studio\PosLayoutSchema;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class StudioTemplateTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('templates@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Studio', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function body(): array
    {
        return ['action' => 'create', 'name' => 'Mi terminal', 'configuration' => PosLayoutSchema::defaults(), 'idempotency_key' => (string) Str::uuid()];
    }

    public function test_personal_templates_create_duplicate_rename_replay_and_do_not_publish(): void
    {
        $body = $this->body();
        $original = $this->postJson('/api/v1/studio/pos/templates', $body)->assertOk()->json('data');
        $this->postJson('/api/v1/studio/pos/templates', $body)->assertOk()->assertJsonPath('data.id', $original['id']);
        $this->postJson('/api/v1/studio/pos/templates', [...$body, 'name' => 'Changed'])->assertConflict();
        $copy = ['action' => 'duplicate', 'name' => 'Mi copia', 'template_id' => $original['id'], 'revision' => 1, 'idempotency_key' => (string) Str::uuid()];
        $duplicate = $this->postJson('/api/v1/studio/pos/templates', $copy)->assertOk()->assertJsonPath('data.configuration', $original['configuration'])->json('data');
        $rename = [...$copy, 'action' => 'rename', 'name' => 'Nuevo nombre', 'template_id' => $duplicate['id'], 'idempotency_key' => (string) Str::uuid()];
        $this->postJson('/api/v1/studio/pos/templates', $rename)->assertOk()->assertJsonPath('data.revision', 2);
        $this->postJson('/api/v1/studio/pos/templates', $rename)->assertOk()->assertJsonPath('data.revision', 2);
        $this->postJson('/api/v1/studio/pos/templates', [...$rename, 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $this->getJson('/api/v1/studio/pos/templates')->assertOk()->assertJsonCount(2, 'data');
        $this->assertDatabaseHas('studio_templates', ['id' => $original['id'], 'name' => 'Mi terminal', 'revision' => 1]);
        $this->assertDatabaseCount('studio_layouts', 0);
        $this->assertDatabaseCount('studio_layout_versions', 0);
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseHas('audit_logs', ['action' => 'studio.template.rename']);
    }

    public function test_template_tenant_permissions_validation_and_audit_rollback(): void
    {
        $body = $this->body();
        $id = $this->postJson('/api/v1/studio/pos/templates', $body)->assertOk()->json('data.id');
        $this->postJson('/api/v1/studio/pos/templates', [...$body, 'idempotency_key' => (string) Str::uuid()])->assertUnprocessable();
        $bad = $this->body();
        $bad['name'] = 'Invalid configuration';
        $bad['configuration']['tokens']['accent'] = 'url(javascript:alert(1))';
        $this->postJson('/api/v1/studio/pos/templates', $bad)->assertUnprocessable();
        $this->postJson('/api/v1/studio/pos/templates', [...$this->body(), 'tenant_id' => $this->owner->tenant_id])->assertUnprocessable();
        $other = $this->company('templates-other@example.test');
        $this->actingAs($other);
        $this->getJson('/api/v1/studio/pos/templates')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/studio/pos/templates', ['action' => 'duplicate', 'name' => 'Ajena', 'template_id' => $id, 'revision' => 1, 'idempotency_key' => (string) Str::uuid()])->assertNotFound();
        $reader = app(TenantContext::class)->run($this->owner->tenant_id, function () {
            $role = Role::create(['name' => 'Studio reader', 'is_owner' => false]);
            $role->permissions()->attach(Permission::where('key', 'studio.view')->value('id'), ['tenant_id' => $this->owner->tenant_id]);

            return User::factory()->create(['role_id' => $role->id]);
        });
        $this->actingAs($reader);
        $this->getJson('/api/v1/studio/pos/templates')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson('/api/v1/studio/pos/templates', $body)->assertForbidden();
        $this->actingAs($this->owner);
        AuditLog::creating(function ($log) {
            if ($log->action === 'studio.template.create') {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $this->postJson('/api/v1/studio/pos/templates', [...$this->body(), 'name' => 'Rollback'])->assertServerError();
        $this->assertDatabaseCount('studio_templates', 1);
    }
}
