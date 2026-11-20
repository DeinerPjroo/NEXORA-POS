<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class DeniedAccessAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->withSession([])->withCredentials()->withCookie(config('session.cookie'), $this->app['session']->driver()->getId());
    }

    private function owner(string $email = 'denials@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Auditoría', 'business_type' => 'restaurant',
            'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function limited(User $user): User
    {
        $role = app(TenantContext::class)->run($user->tenant_id, fn () => Role::where('is_owner', false)->where('name', 'Encargado de inventario')->firstOrFail());
        $user->forceFill(['role_id' => $role->id])->save();

        return $user->fresh();
    }

    public function test_permission_denial_uses_own_tenant_and_only_server_route_metadata(): void
    {
        $actor = $this->limited($this->owner());
        $foreign = $this->owner('foreign-denials@example.test');
        $this->actingAs($actor)->postJson('/api/v1/categories?signature=do-not-log-this', ['tenant_id' => $foreign->tenant_id,
            'password' => 'Secret-DoNotLog', 'credential' => '654321', 'name' => 'Injected name', 'notes' => 'Private note'])->assertForbidden();
        $log = DB::table('audit_logs')->where('action', 'access.denied')->first();
        $this->assertNotNull($log);
        $this->assertEquals($actor->tenant_id, $log->tenant_id);
        $this->assertEquals($actor->id, $log->actor_id);
        $metadata = json_decode($log->metadata, true);
        ksort($metadata); // MySQL JSON objects do not preserve insertion order.
        $this->assertSame(['method' => 'POST', 'route' => 'api/v1/categories', 'status' => 403], $metadata);
        foreach (['Secret-DoNotLog', '654321', 'Injected name', 'Private note', 'do-not-log-this'] as $secret) {
            $this->assertStringNotContainsString($secret, json_encode($log));
        }
        $this->assertDatabaseMissing('categories', ['name' => 'Injected name']);
    }

    public function test_foreign_and_absent_ids_remain_indistinguishable_and_logs_are_sampled(): void
    {
        $actor = $this->owner();
        $foreign = $this->owner('unavailable@example.test');
        $id = DB::table('branches')->where('tenant_id', $foreign->tenant_id)->value('id');
        $this->actingAs($actor)->putJson('/api/v1/branches/'.$id, [])->assertNotFound();
        $this->putJson('/api/v1/branches/999999', [])->assertNotFound();
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'access.unavailable')->count());
        $metadata = json_decode(DB::table('audit_logs')->where('action', 'access.unavailable')->value('metadata'), true);
        $this->assertSame('api/v1/branches/{branch}', $metadata['route']);
        $this->assertArrayNotHasKey('id', $metadata);
        $this->travel(61)->seconds();
        $this->putJson('/api/v1/branches/999999', [])->assertNotFound();
        $this->assertSame(2, DB::table('audit_logs')->where('action', 'access.unavailable')->count());
    }

    public function test_lock_and_stale_session_denials_are_recorded_after_response(): void
    {
        $actor = $this->owner();
        $this->actingAs($actor)->postJson('/api/v1/auth/screen/lock')->assertOk();
        $this->getJson('/api/v1/branches')->assertStatus(423);
        $this->assertDatabaseHas('audit_logs', ['action' => 'access.locked', 'actor_id' => $actor->id]);
        $this->assertDatabaseCount('sales', 0);
        // Current authentication is retained even when a downstream guard clears the session.
        $actor->forceFill(['mfa_version' => 2])->save();
        Auth::guard('sanctum')->forgetUser();
        $this->actingAs($actor->fresh())->getJson('/api/v1/branches')->assertUnauthorized();
        $this->assertDatabaseHas('audit_logs', ['action' => 'access.unauthorized', 'actor_id' => $actor->id]);
    }

    public function test_unauthenticated_unknown_routes_successes_and_validation_are_not_misattributed(): void
    {
        $this->getJson('/api/v1/branches')->assertUnauthorized();
        $actor = $this->owner();
        $this->actingAs($actor)->getJson('/api/v1/not-a-route')->assertNotFound();
        $this->getJson('/api/v1/branches')->assertOk();
        $this->postJson('/api/v1/categories', [])->assertUnprocessable();
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'like', 'access.%')->count());
    }

    public function test_audit_failure_cannot_change_denial_or_disclose_its_diagnostic(): void
    {
        $actor = $this->limited($this->owner());
        Log::spy();
        Event::listen('eloquent.creating: '.AuditLog::class, fn () => throw new \RuntimeException('Private failure diagnostic'));
        $this->actingAs($actor)->postJson('/api/v1/categories')->assertForbidden()->assertDontSee('Private failure diagnostic');
        Log::shouldHaveReceived('warning')->with('Denied-access audit unavailable.', ['exception' => \RuntimeException::class])->once();
    }

    public function test_after_business_rollback_the_denial_is_retained_but_data_is_not(): void
    {
        Route::middleware(['api', 'auth:sanctum', 'audit.denials', 'mfa.session', 'tenant', 'screen.unlocked'])->post('api/v1/audit-test-rollback', fn () => DB::transaction(function () {
            DB::table('categories')->insert(['tenant_id' => app(TenantContext::class)->id(), 'name' => 'Must rollback', 'color' => '#8271FF', 'revision' => 1, 'is_active' => true]);
            abort(403);
        }));
        $this->actingAs($this->owner())->postJson('/api/v1/audit-test-rollback')->assertForbidden();
        $this->assertDatabaseMissing('categories', ['name' => 'Must rollback']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'access.denied']);
    }

    public function test_throttling_is_logged_without_exposing_submitted_credentials(): void
    {
        $this->actingAs($this->owner());
        $body = ['current_password' => 'WrongPasswordNeverLog', 'revision' => 1, 'pin' => '839205', 'pin_confirmation' => '839205'];
        for ($i = 0; $i < 5; $i++) {
            $this->putJson('/api/v1/auth/security', $body)->assertUnprocessable();
        }
        $this->putJson('/api/v1/auth/security', $body)->assertTooManyRequests();
        $this->assertDatabaseHas('audit_logs', ['action' => 'access.limited']);
        $this->assertStringNotContainsString('WrongPasswordNeverLog', DB::table('audit_logs')->get()->toJson());
        $this->assertStringNotContainsString('839205', DB::table('audit_logs')->get()->toJson());
    }

    public function test_budget_limits_different_routes_and_audit_readers_only_see_own_history(): void
    {
        $a = $this->owner();
        $b = $this->owner('reader-denials@example.test');
        $middleware = ['api', 'auth:sanctum', 'audit.denials', 'mfa.session', 'tenant', 'screen.unlocked'];
        $this->actingAs($a);
        for ($i = 0; $i < 22; $i++) {
            Route::middleware($middleware)->get('api/v1/denial-budget/'.$i, fn () => abort(403));
            $this->getJson('/api/v1/denial-budget/'.$i)->assertForbidden();
        }
        $this->assertSame(20, DB::table('audit_logs')->where('action', 'access.denied')->where('tenant_id', $a->tenant_id)->count());
        Auth::guard('sanctum')->forgetUser();
        $this->actingAs($b)->getJson('/api/v1/denial-budget/0')->assertForbidden();
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'access.denied')->where('tenant_id', $b->tenant_id)->count());
        $activity = $this->getJson('/api/v1/workspace/overview')->assertOk()->json('activity');
        foreach ($activity as $entry) {
            $this->assertSame($b->tenant_id, $entry['tenant_id']);
        }
        try {
            app(TenantContext::class)->id();
            $this->fail('El contexto no se restauró.');
        } catch (\LogicException) {
            $this->assertTrue(true);
        }
    }
}
