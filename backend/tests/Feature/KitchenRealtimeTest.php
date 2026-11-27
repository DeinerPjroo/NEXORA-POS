<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Kitchen\KitchenChanged;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class KitchenRealtimeTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = app(RegisterCompany::class)->execute(['company_name' => 'Kitchen realtime', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Chef', 'email' => 'realtime@example.test', 'password' => 'SeguraNexora123']);
        $this->branch = app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::firstOrFail()->id);
        config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'test-key', 'broadcasting.connections.reverb.secret' => 'test-secret', 'broadcasting.connections.reverb.app_id' => 'test-app', 'broadcasting.connections.reverb.options.host' => '127.0.0.1']);
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->withSession([]);
        $this->withCredentials();
        $this->withCookie(config('session.cookie'), $this->app['session']->driver()->getId());
    }

    private function subscribe(int $tenant, int $branch)
    {
        return $this->postJson('/api/v1/broadcasting/auth', ['socket_id' => '123.456', 'channel_name' => "private-kitchen.$tenant.$branch"]);
    }

    public function test_private_authorization_and_configuration_are_scoped_and_contain_no_secret(): void
    {
        $this->getJson('/api/v1/kitchen/realtime?branch_id='.$this->branch)->assertOk()->assertJsonPath('enabled', true)->assertJsonMissing(['secret' => 'test-secret']);
        $response = $this->subscribe($this->owner->tenant_id, $this->branch)->assertOk();
        $channel = 'private-kitchen.'.$this->owner->tenant_id.'.'.$this->branch;
        $this->assertSame('test-key:'.hash_hmac('sha256', '123.456:'.$channel, 'test-secret'), $response->json('auth'));
        $this->subscribe($this->owner->tenant_id + 1, $this->branch)->assertForbidden();
        $this->subscribe($this->owner->tenant_id, 999999)->assertForbidden();
        $this->postJson('/api/v1/broadcasting/auth', ['socket_id' => '123.456', 'channel_name' => 'private-orders.1'])->assertUnprocessable();
        $this->postJson('/api/v1/broadcasting/auth', ['socket_id' => 'invalid', 'channel_name' => $channel])->assertUnprocessable();
        config(['broadcasting.default' => 'null']);
        $this->getJson('/api/v1/kitchen/realtime?branch_id='.$this->branch)->assertExactJson(['enabled' => false]);
        $this->subscribe($this->owner->tenant_id, $this->branch)->assertStatus(503);
        $event = new KitchenChanged($this->owner->tenant_id, $this->branch);
        $this->assertSame(['refresh' => true], $event->broadcastWith());
        $this->assertSame($channel, (string) $event->broadcastOn()[0]);
    }

    public function test_branch_assignment_permission_and_screen_lock_protect_subscriptions(): void
    {
        $employee = app(TenantContext::class)->run($this->owner->tenant_id, function () {
            $role = Role::create(['name' => 'Cocina', 'is_owner' => false]);
            $role->permissions()->attach(Permission::where('key', 'kitchen.view')->firstOrFail()->id, ['tenant_id' => $this->owner->tenant_id]);

            return User::factory()->create(['role_id' => $role->id, 'all_branches' => false]);
        });
        $this->actingAs($employee);
        $this->getJson('/api/v1/kitchen/realtime?branch_id='.$this->branch)->assertNotFound();
        $this->subscribe($this->owner->tenant_id, $this->branch)->assertForbidden();
        DB::table('employee_branches')->insert(['tenant_id' => $this->owner->tenant_id, 'user_id' => $employee->id, 'branch_id' => $this->branch]);
        $this->subscribe($this->owner->tenant_id, $this->branch)->assertOk();
        $this->postJson('/api/v1/auth/screen/lock')->assertOk();
        $this->subscribe($this->owner->tenant_id, $this->branch)->assertStatus(423);
        $this->getJson('/api/v1/kitchen/realtime?branch_id='.$this->branch)->assertStatus(423);
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_other_companies_inactive_branches_and_actors_without_kitchen_access_are_denied(): void
    {
        $other = app(RegisterCompany::class)->execute(['company_name' => 'Otra cocina', 'business_type' => 'restaurant', 'branch_name' => 'Otra sede', 'name' => 'Otro', 'email' => 'other-realtime@example.test', 'password' => 'SeguraNexora123']);
        $otherBranch = app(TenantContext::class)->run($other->tenant_id, fn () => Branch::firstOrFail()->id);
        $this->getJson('/api/v1/kitchen/realtime?branch_id='.$otherBranch)->assertNotFound();
        $this->subscribe($other->tenant_id, $otherBranch)->assertForbidden();
        app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::whereKey($this->branch)->update(['is_active' => false]));
        $this->subscribe($this->owner->tenant_id, $this->branch)->assertForbidden();
        $this->getJson('/api/v1/kitchen/realtime?branch_id='.$this->branch)->assertNotFound();
        $employee = app(TenantContext::class)->run($this->owner->tenant_id, function () {
            $role = Role::create(['name' => 'Sin cocina', 'is_owner' => false]);

            return User::factory()->create(['role_id' => $role->id]);
        });
        $this->actingAs($employee);
        $this->subscribe($this->owner->tenant_id, $this->branch)->assertForbidden();
        $this->getJson('/api/v1/kitchen/realtime?branch_id='.$this->branch)->assertForbidden();
    }
}
