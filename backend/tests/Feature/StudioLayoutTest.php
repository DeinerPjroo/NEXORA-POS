<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Studio\DeliveriesLayoutSchema;
use App\Domains\Studio\KitchenLayoutSchema;
use App\Domains\Studio\PosLayoutSchema;
use App\Domains\Studio\TablesLayoutSchema;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\StudioLayout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class StudioLayoutTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('studio@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Studio', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    private function body(int $revision = 0): array
    {
        return [...$this->key(), 'revision' => $revision, 'configuration' => PosLayoutSchema::defaults()];
    }

    private function scope(callable $callback): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $callback);
    }

    private function employee(array $keys): User
    {
        return $this->scope(function () use ($keys) {
            $role = Role::create(['name' => Str::random(12), 'is_owner' => false]);
            $role->permissions()->attach(Permission::whereIn('key', $keys)->pluck('id'), ['tenant_id' => $this->owner->tenant_id]);

            return User::factory()->create(['role_id' => $role->id]);
        });
    }

    public function test_tables_reuse_versions_but_remain_separate_from_pos(): void
    {
        $config = TablesLayoutSchema::defaults();
        $config['tokens']['card_width'] = 130;
        $body = [...$this->key(), 'revision' => 0, 'configuration' => $config];
        $this->postJson('/api/v1/studio/tables/draft', $body)->assertOk()->assertJsonPath('data.surface', 'tables');
        $this->postJson('/api/v1/studio/tables/draft', $body)->assertOk()->assertJsonPath('data.revision', 1);
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data', null);
        $this->getJson('/api/v1/studio/tables/active')->assertJsonPath('data.revision', 0);
        $this->postJson('/api/v1/studio/tables/publish', [...$this->key(), 'revision' => 1])->assertOk();
        $this->getJson('/api/v1/studio/tables/active')->assertJsonPath('data.configuration.tokens.card_width', 130);
        $versions = $this->getJson('/api/v1/studio/tables/versions')->assertOk()->assertJsonCount(2, 'data')->json('data');
        $this->postJson('/api/v1/studio/pos/draft', $this->body())->assertOk();
        $this->postJson('/api/v1/studio/pos/restore', [...$this->key(), 'revision' => 1, 'version_id' => $versions[0]['id'], 'reason' => 'Wrong surface'])->assertNotFound();
        $this->postJson('/api/v1/studio/tables/restore', [...$this->key(), 'revision' => 2, 'version_id' => $versions[1]['id'], 'reason' => 'Restore tables'])->assertOk()->assertJsonPath('data.revision', 3)->assertJsonPath('data.published_revision', 2);
        $this->assertDatabaseCount('dining_sessions', 0);
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_kitchen_reuses_publication_versions_and_preserves_other_surfaces(): void
    {
        $config = KitchenLayoutSchema::defaults();
        $config['tokens']['padding'] = 8;
        $body = [...$this->key(), 'revision' => 0, 'configuration' => $config];
        $this->postJson('/api/v1/studio/kitchen/draft', $body)->assertOk()->assertJsonPath('data.surface', 'kitchen');
        $this->postJson('/api/v1/studio/kitchen/draft', $body)->assertOk()->assertJsonPath('data.revision', 1);
        $this->getJson('/api/v1/studio/kitchen/active')->assertJsonPath('data.revision', 0);
        $this->postJson('/api/v1/studio/kitchen/publish', [...$this->key(), 'revision' => 1])->assertOk();
        $this->getJson('/api/v1/studio/kitchen/active')->assertJsonPath('data.configuration.tokens.padding', 8);
        $versions = $this->getJson('/api/v1/studio/kitchen/versions')->assertOk()->assertJsonCount(2, 'data')->json('data');
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data', null);
        $this->getJson('/api/v1/studio/tables')->assertJsonPath('data', null);
        $this->postJson('/api/v1/studio/kitchen/restore', [...$this->key(), 'revision' => 2, 'version_id' => $versions[1]['id'], 'reason' => 'Restore kitchen'])->assertOk()->assertJsonPath('data.published_revision', 2);
        $this->assertDatabaseCount('kitchen_tickets', 0);
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_pickup_and_delivery_studio_publications_remain_independent(): void
    {
        foreach (['pickup' => 400, 'delivery_pos' => 420] as $surface => $width) {
            $body = $this->body();
            $body['configuration']['tokens']['order_width'] = $width;
            $this->postJson('/api/v1/studio/'.$surface.'/draft', $body)->assertOk()->assertJsonPath('data.surface', $surface);
            $this->postJson('/api/v1/studio/'.$surface.'/publish', [...$this->key(), 'revision' => 1])->assertOk();
            $this->getJson('/api/v1/studio/'.$surface.'/active')->assertOk()->assertJsonPath('data.configuration.tokens.order_width', $width);
        }
        $config = DeliveriesLayoutSchema::defaults();
        $body = [...$this->key(), 'revision' => 0, 'configuration' => $config];
        $this->postJson('/api/v1/studio/deliveries/draft', $body)->assertOk();
        $this->postJson('/api/v1/studio/deliveries/draft', $body)->assertOk()->assertJsonPath('data.revision', 1);
        $this->postJson('/api/v1/studio/deliveries/publish', [...$this->key(), 'revision' => 1])->assertOk();
        $this->getJson('/api/v1/studio/deliveries/active')->assertJsonPath('data.configuration', $config);
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data', null);
        $versions = $this->getJson('/api/v1/studio/pickup/versions')->json('data');
        $this->postJson('/api/v1/studio/deliveries/restore', [...$this->key(), 'revision' => 2, 'version_id' => $versions[0]['id'], 'reason' => 'Wrong surface'])->assertNotFound();
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_deliveries', 0);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_delivery_studio_schema_permissions_and_tenant_enforcement(): void
    {
        $body = [...$this->key(), 'revision' => 0, 'configuration' => DeliveriesLayoutSchema::defaults()];
        $bad = $body;
        $bad['configuration']['tokens']['pending'] = 'url(javascript:alert(1))';
        $this->postJson('/api/v1/studio/deliveries/draft', $bad)->assertUnprocessable();
        $this->postJson('/api/v1/studio/deliveries/draft', $this->body())->assertUnprocessable();
        $this->postJson('/api/v1/studio/pos/draft', [...$this->body(), 'surface' => 'pickup'])->assertUnprocessable();
        $this->postJson('/api/v1/studio/deliveries/draft', $body)->assertOk();
        $reader = $this->employee(['orders.view']);
        $this->actingAs($reader);
        $this->getJson('/api/v1/studio/deliveries/active')->assertForbidden();
        $this->getJson('/api/v1/studio/pickup/active')->assertForbidden();
        $courier = $this->employee(['orders.view', 'deliveries.operate']);
        $this->actingAs($courier);
        $this->getJson('/api/v1/studio/deliveries/active')->assertOk();
        $this->postJson('/api/v1/studio/deliveries/draft', $body)->assertForbidden();
        $other = $this->company('delivery-studio-other@example.test');
        $this->actingAs($other);
        foreach (['deliveries', 'pickup', 'delivery_pos'] as $surface) {
            $this->getJson('/api/v1/studio/'.$surface)->assertJsonPath('data', null);
            $this->getJson('/api/v1/studio/'.$surface.'/active')->assertJsonPath('data.revision', 0);
        }
    }

    public function test_kitchen_schema_permissions_and_tenant_enforcement(): void
    {
        $body = [...$this->key(), 'revision' => 0, 'configuration' => KitchenLayoutSchema::defaults()];
        $bad = $body;
        $bad['configuration']['tokens']['new_color'] = 'url(javascript:alert(1))';
        $this->postJson('/api/v1/studio/kitchen/draft', $bad)->assertUnprocessable();
        $bad = $body;
        $bad['configuration']['hide_notes'] = true;
        $this->postJson('/api/v1/studio/kitchen/draft', $bad)->assertUnprocessable();
        $this->postJson('/api/v1/studio/kitchen/draft', $this->body())->assertUnprocessable();
        $this->postJson('/api/v1/studio/kitchen/draft', $body)->assertOk();
        $reader = $this->employee(['studio.view', 'kitchen.view']);
        $this->actingAs($reader);
        $this->getJson('/api/v1/studio/kitchen/active')->assertOk();
        $this->postJson('/api/v1/studio/kitchen/draft', $body)->assertForbidden();
        $this->postJson('/api/v1/studio/kitchen/publish', [...$this->key(), 'revision' => 1])->assertForbidden();
        $staff = $this->employee(['dining.view']);
        $this->actingAs($staff);
        $this->getJson('/api/v1/studio/kitchen/active')->assertForbidden();
        $other = $this->company('kitchen-studio-other@example.test');
        $this->actingAs($other);
        $this->getJson('/api/v1/studio/kitchen')->assertJsonPath('data', null);
        $this->getJson('/api/v1/studio/kitchen/versions')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/studio/kitchen/active')->assertJsonPath('data.revision', 0);
    }

    public function test_tables_schema_permissions_and_tenant_enforcement(): void
    {
        $this->postJson('/api/v1/studio/tables/draft', $this->body())->assertUnprocessable();
        $body = [...$this->key(), 'revision' => 0, 'configuration' => TablesLayoutSchema::defaults()];
        $bad = $body;
        $bad['configuration']['tokens']['available'] = 'url(javascript:alert(1))';
        $this->postJson('/api/v1/studio/tables/draft', $bad)->assertUnprocessable();
        $this->postJson('/api/v1/studio/pos/draft', [...$this->body(), 'surface' => 'tables'])->assertUnprocessable();
        $this->postJson('/api/v1/studio/tables/draft', $body)->assertOk();
        $reader = $this->employee(['studio.view']);
        $this->actingAs($reader);
        $this->postJson('/api/v1/studio/tables/draft', $body)->assertForbidden();
        $this->getJson('/api/v1/studio/tables/active')->assertForbidden();
        $this->getJson('/api/v1/studio/tables')->assertOk();
        $other = $this->company('tables-studio-other@example.test');
        $this->actingAs($other);
        $this->getJson('/api/v1/studio/tables')->assertJsonPath('data', null);
        $this->getJson('/api/v1/studio/tables/versions')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/studio/tables/active')->assertJsonPath('data.revision', 0);
    }

    public function test_studio_layout_draft_is_isolated_from_runtime_and_publication_preserves_business_data(): void
    {
        $defaults = PosLayoutSchema::defaults();
        $this->getJson('/api/v1/studio/pos')->assertOk()->assertJsonPath('data', null);
        $this->getJson('/api/v1/studio/pos/active')->assertOk()->assertJsonPath('data.revision', 0);
        $body = $this->body();
        $body['configuration']['tokens']['order_width'] = 400;
        $this->postJson('/api/v1/studio/pos/draft', $body)->assertOk()->assertJsonPath('data.revision', 1)->assertJsonPath('data.published', null);
        $this->postJson('/api/v1/studio/pos/draft', $body)->assertOk()->assertJsonPath('data.revision', 1);
        $this->getJson('/api/v1/studio/pos/active')->assertJsonPath('data.configuration', $defaults);
        $publish = [...$this->key(), 'revision' => 1];
        $this->postJson('/api/v1/studio/pos/publish', $publish)->assertOk()->assertJsonPath('data.published_revision', 2);
        $this->postJson('/api/v1/studio/pos/publish', $publish)->assertOk()->assertJsonPath('data.revision', 2);
        $this->getJson('/api/v1/studio/pos/active')->assertJsonPath('data.configuration.tokens.order_width', 400)->assertJsonPath('data.revision', 2);
        $this->postJson('/api/v1/studio/pos/draft', $this->body(2))->assertOk()->assertJsonPath('data.revision', 3);
        $this->getJson('/api/v1/studio/pos/active')->assertJsonPath('data.configuration.tokens.order_width', 400)->assertJsonPath('data.revision', 2);
        $this->postJson('/api/v1/studio/pos/draft', [...$body, ...$this->key()])->assertConflict();
        $this->postJson('/api/v1/studio/pos/publish', [...$this->key(), 'revision' => 2])->assertConflict();
        $this->assertDatabaseCount('studio_layouts', 1);
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseHas('audit_logs', ['action' => 'studio.layout.published']);
    }

    public function test_studio_rejects_executable_content_unknown_properties_components_and_unsafe_dimensions(): void
    {
        $configs = [];
        foreach ([['tokens', 'accent', 'url(javascript:alert(1))'], ['tokens', 'order_width', 99999], ['tokens', 'font_size', 1], ['tokens', 'css', 'body{}'], ['options', 'payments', false]] as [$section, $key, $value]) {
            $c = PosLayoutSchema::defaults();
            $c[$section][$key] = $value;
            $configs[] = $c;
        }
        $c = PosLayoutSchema::defaults();
        $c['panels'] = ['actions', 'order', 'categories', '<script>'];
        $configs[] = $c;
        $c = PosLayoutSchema::defaults();
        $c['panels'] = ['order', 'order', 'products', 'actions'];
        $configs[] = $c;
        $c = PosLayoutSchema::defaults();
        $c['schema_version'] = 999;
        $configs[] = $c;
        foreach ($configs as $config) {
            $this->postJson('/api/v1/studio/pos/draft', [...$this->body(), 'configuration' => $config])->assertUnprocessable();
        }
        $this->postJson('/api/v1/studio/pos/draft', [...$this->body(), 'tenant_id' => $this->owner->tenant_id])->assertUnprocessable();
        $this->assertDatabaseCount('studio_layouts', 0);
    }

    public function test_studio_permissions_and_tenants_are_enforced_before_replay(): void
    {
        $editor = $this->employee(['studio.view', 'studio.edit']);
        $this->actingAs($editor);
        $body = $this->body();
        $this->postJson('/api/v1/studio/pos/draft', $body)->assertOk();
        $this->postJson('/api/v1/studio/pos/publish', [...$this->key(), 'revision' => 1])->assertForbidden();
        $this->getJson('/api/v1/studio/pos/active')->assertForbidden();
        $reader = $this->employee(['studio.view']);
        $this->actingAs($reader);
        $this->getJson('/api/v1/studio/pos')->assertOk();
        $this->postJson('/api/v1/studio/pos/draft', $body)->assertForbidden();
        $other = $this->company('other-studio@example.test');
        $this->actingAs($other);
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data', null);
        $this->postJson('/api/v1/studio/pos/draft', $body)->assertOk()->assertJsonPath('data.tenant_id', $other->tenant_id);
        $this->assertDatabaseCount('studio_layouts', 2);
    }

    public function test_scoped_layouts_are_independent_and_runtime_derives_role_from_session(): void
    {
        $employee = $this->employee(['orders.manage', 'catalog.view']);
        $global = $this->body();
        $global['configuration']['tokens']['accent'] = '#112233';
        $this->postJson('/api/v1/studio/pos/draft', $global)->assertOk();
        $this->postJson('/api/v1/studio/pos/publish', [...$this->key(), 'revision' => 1])->assertOk();
        $specific = [...$this->body(), 'device' => 'desktop', 'role_id' => $employee->role_id];
        $specific['configuration']['tokens']['accent'] = '#334455';
        $this->postJson('/api/v1/studio/pos/draft', $specific)->assertOk();
        $this->postJson('/api/v1/studio/pos/publish', [...$this->key(), 'revision' => 1, 'device' => 'desktop', 'role_id' => $employee->role_id])->assertOk();
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data.revision', 2)->assertJsonPath('data.published.tokens.accent', '#112233');
        $this->actingAs($employee);
        $this->getJson('/api/v1/studio/pos/active?device=desktop')->assertOk()->assertJsonPath('data.configuration.tokens.accent', '#334455');
        $this->getJson('/api/v1/studio/pos/active?device=mobile')->assertOk()->assertJsonPath('data.configuration.tokens.accent', '#112233');
        $this->getJson('/api/v1/studio/pos/active?role_id='.$this->owner->role_id)->assertUnprocessable();
    }

    public function test_scope_authorization_device_constraints_and_version_isolation(): void
    {
        $other = $this->company('studio-scope-other@example.test');
        $this->actingAs($this->owner);
        $this->getJson('/api/v1/studio/pos?role_id='.$other->role_id)->assertNotFound();
        $this->postJson('/api/v1/studio/pos/draft', [...$this->body(), 'role_id' => $other->role_id])->assertNotFound();
        $this->postJson('/api/v1/studio/pos/draft', [...$this->body(), 'device' => 'mobile'])->assertUnprocessable();
        $mobile = [...$this->body(), 'device' => 'mobile'];
        $mobile['configuration']['tokens']['product_columns'] = 2;
        $this->postJson('/api/v1/studio/pos/draft', $mobile)->assertOk();
        $versions = $this->getJson('/api/v1/studio/pos/versions?device=mobile')->assertOk()->json('data');
        $this->getJson('/api/v1/studio/pos/versions')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/studio/pos/draft', $this->body())->assertOk();
        $this->postJson('/api/v1/studio/pos/restore', [...$this->key(), 'revision' => 1, 'version_id' => $versions[0]['id'], 'reason' => 'Wrong scope'])->assertNotFound();
        $editor = $this->employee(['studio.view', 'studio.edit']);
        $this->actingAs($editor);
        $this->getJson('/api/v1/studio/pos?role_id='.$editor->role_id)->assertForbidden();
        $this->postJson('/api/v1/studio/pos/draft', [...$this->body(), 'role_id' => $editor->role_id])->assertForbidden();
    }

    public function test_studio_audit_failure_rolls_back_publication_and_invalid_published_schema_falls_back(): void
    {
        $this->postJson('/api/v1/studio/pos/draft', $this->body())->assertOk();
        $fail = true;
        AuditLog::creating(function ($log) use (&$fail) {
            if ($fail && $log->action === 'studio.layout.published') {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $body = [...$this->key(), 'revision' => 1];
        $this->postJson('/api/v1/studio/pos/publish', $body)->assertServerError();
        $this->getJson('/api/v1/studio/pos')->assertJsonPath('data.revision', 1)->assertJsonPath('data.published', null);
        $fail = false;
        $this->postJson('/api/v1/studio/pos/publish', $body)->assertOk();
        $this->scope(fn () => StudioLayout::firstOrFail()->update(['published' => ['schema_version' => 999]]));
        $this->getJson('/api/v1/studio/pos/active')->assertOk()->assertJsonPath('data.configuration', PosLayoutSchema::defaults());
    }
}
