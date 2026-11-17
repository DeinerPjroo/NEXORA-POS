<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use LogicException;
use Tests\TestCase;

class FoundationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function payload(string $email = 'ana@example.test'): array
    {
        return ['company_name' => 'Casa Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Sede principal', 'name' => 'Ana Pérez', 'email' => $email, 'password' => 'SeguraNexora123', 'password_confirmation' => 'SeguraNexora123'];
    }

    private function owner(string $email = 'ana@example.test'): User
    {
        return app(RegisterCompany::class)->execute($this->payload($email))->refresh();
    }

    public function test_registration_creates_a_complete_workspace_in_a_transaction(): void
    {
        $this->postJson('/api/v1/auth/register', $this->payload())->assertCreated();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('company.name', 'Casa Oliva')->assertJsonPath('settings.revision', 1)->assertJsonPath('role.is_owner', true);
        $this->assertDatabaseCount('tenants', 1);
        $this->assertDatabaseCount('branches', 1);
        $this->assertDatabaseCount('roles', 7);
        $this->assertDatabaseCount('theme_versions', 1);
        $this->assertTrue(Hash::check('SeguraNexora123', User::first()->password));
        $this->assertDatabaseHas('audit_logs', ['action' => 'company.created']);
    }

    public function test_registration_rejects_injected_tenant_and_weak_passwords(): void
    {
        $this->postJson('/api/v1/auth/register', [...$this->payload(), 'tenant_id' => 45, 'password' => '123', 'password_confirmation' => '123'])->assertUnprocessable()->assertJsonValidationErrors(['tenant_id', 'password']);
        $this->assertDatabaseCount('tenants', 0);
    }

    public function test_duplicate_email_does_not_create_another_company(): void
    {
        $this->owner();
        $this->postJson('/api/v1/auth/register', $this->payload())->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertDatabaseCount('tenants', 1);
    }

    public function test_registration_rolls_back_when_workspace_creation_fails(): void
    {
        $this->expectException(\Throwable::class);
        try {
            app(RegisterCompany::class)->execute([...$this->payload(), 'branch_name' => null]);
        } finally {
            $this->assertDatabaseCount('tenants', 0);
            $this->assertDatabaseCount('users', 0);
        }
    }

    public function test_guests_cannot_read_workspace_data(): void
    {
        foreach (['auth/me', 'branches', 'roles', 'workspace/overview', 'workspace/team', 'workspace/theme'] as $path) {
            $this->getJson('/api/v1/'.$path)->assertUnauthorized();
        }
    }

    public function test_login_logout_and_invalid_password(): void
    {
        $this->owner();
        $this->postJson('/api/v1/auth/login', ['email' => 'ana@example.test', 'password' => 'incorrecta'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', ['email' => 'ANA@example.test', 'password' => 'SeguraNexora123'])->assertOk();
        $this->getJson('/api/v1/auth/me')->assertOk();
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertGuest('web');
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.failed']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.logout']);
    }

    public function test_login_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'unknown@example.test', 'password' => 'wrong'])->assertUnprocessable();
        }
        $this->postJson('/api/v1/auth/login', ['email' => 'unknown@example.test', 'password' => 'wrong'])->assertTooManyRequests();
    }

    public function test_session_writes_require_csrf_outside_test_bypass(): void
    {
        $this->app->instance('env', 'local');
        $this->postJson('/api/v1/auth/login', ['email' => 'ana@example.test', 'password' => 'wrong'])->assertStatus(419);
    }

    public function test_scopes_fail_closed_without_a_tenant_context(): void
    {
        $this->expectException(LogicException::class);
        Branch::all();
    }

    public function test_context_is_restored_after_an_exception(): void
    {
        $context = app(TenantContext::class);
        try {
            $context->run(1, fn () => throw new LogicException('stop'));
        } catch (LogicException) {
        }
        $this->expectException(LogicException::class);
        $context->id();
    }

    public function test_company_a_cannot_read_company_b_branches_users_roles_or_history(): void
    {
        $a = $this->owner();
        $b = $this->owner('b@example.test');
        $this->actingAs($a);
        $this->getJson('/api/v1/branches')->assertOk()->assertJsonCount(1)->assertJsonPath('0.tenant_id', $a->tenant_id);
        $this->getJson('/api/v1/roles')->assertOk()->assertJsonCount(7, 'roles')->assertJsonPath('roles.0.tenant_id', $a->tenant_id);
        $this->getJson('/api/v1/workspace/team')->assertOk()->assertJsonCount(1)->assertJsonMissing(['email' => $b->email]);
        $this->getJson('/api/v1/workspace/theme')->assertOk()->assertJsonCount(1, 'versions')->assertJsonPath('versions.0.tenant_id', $a->tenant_id);
        $this->getJson('/api/v1/workspace/overview')->assertOk()->assertJsonPath('branches', 1)->assertJsonPath('team', 1)->assertJsonCount(1, 'activity');
    }

    public function test_foreign_branch_id_cannot_be_modified_even_with_tenant_header(): void
    {
        $a = $this->owner();
        $b = $this->owner('b@example.test');
        $foreign = app(TenantContext::class)->run($b->tenant_id, fn () => Branch::first());
        $this->actingAs($a)->withHeader('X-Tenant-Id', (string) $b->tenant_id)
            ->putJson('/api/v1/branches/'.$foreign->id, ['name' => 'Intrusión', 'code' => 'TEST'])->assertNotFound();
        $this->assertDatabaseMissing('branches', ['name' => 'Intrusión']);
    }

    public function test_foreign_role_id_cannot_be_modified(): void
    {
        $a = $this->owner();
        $b = $this->owner('b@example.test');
        $foreign = app(TenantContext::class)->run($b->tenant_id, fn () => Role::where('is_owner', false)->first());
        $this->actingAs($a)->putJson('/api/v1/roles/'.$foreign->id, ['name' => 'Intrusión', 'permissions' => ['dashboard.view']])->assertNotFound();
    }

    public function test_database_prevents_cross_company_role_assignment(): void
    {
        $a = $this->owner();
        $b = $this->owner('b@example.test');
        $this->expectException(QueryException::class);
        DB::table('users')->where('id', $a->id)->update(['role_id' => $b->role_id]);
    }

    public function test_model_rejects_cross_company_writes(): void
    {
        $a = $this->owner();
        $b = $this->owner('b@example.test');
        $this->expectException(LogicException::class);
        app(TenantContext::class)->run($a->tenant_id, function () use ($b) {
            $branch = new Branch(['name' => 'Malicious', 'code' => 'BAD']);
            $branch->tenant_id = $b->tenant_id;
            $branch->save();
        });
    }

    public function test_branch_codes_are_unique_per_company(): void
    {
        $a = $this->owner();
        $this->actingAs($a)->postJson('/api/v1/branches', ['name' => 'Norte', 'code' => 'NORTE'])->assertCreated();
        $this->postJson('/api/v1/branches', ['name' => 'Duplicado', 'code' => 'NORTE'])->assertUnprocessable();
        $b = $this->owner('b@example.test');
        $this->actingAs($b)->postJson('/api/v1/branches', ['name' => 'Norte B', 'code' => 'NORTE'])->assertCreated();
    }

    public function test_non_privileged_role_cannot_manage_company_resources(): void
    {
        $user = $this->owner();
        $role = app(TenantContext::class)->run($user->tenant_id, fn () => Role::where('name', 'Mesero')->first());
        $user->forceFill(['role_id' => $role->id])->save();
        $this->actingAs($user)->postJson('/api/v1/branches', ['name' => 'No', 'code' => 'NO'])->assertForbidden();
        $this->getJson('/api/v1/roles')->assertForbidden();
        $this->getJson('/api/v1/workspace/team')->assertForbidden();
        $this->getJson('/api/v1/workspace/overview')->assertOk()->assertJsonCount(0, 'activity');
        $this->putJson('/api/v1/workspace/theme', ['revision' => 1, 'theme' => config('nexora.theme')])->assertForbidden();
    }

    public function test_owner_role_is_protected_and_custom_role_is_persisted(): void
    {
        $owner = $this->owner();
        $this->actingAs($owner)->putJson('/api/v1/roles/'.$owner->role_id, ['name' => 'Cambio', 'permissions' => []])->assertForbidden();
        $this->postJson('/api/v1/roles', ['name' => 'Supervisor', 'permissions' => ['dashboard.view', 'branches.view']])->assertCreated()->assertJsonCount(2, 'permissions');
        $this->assertDatabaseHas('audit_logs', ['action' => 'role.saved']);
    }

    public function test_suspended_companies_cannot_use_existing_sessions(): void
    {
        $user = $this->owner();
        Tenant::where('id', $user->tenant_id)->update(['status' => 'suspended']);
        $this->actingAs($user)->getJson('/api/v1/branches')->assertForbidden();
    }

    public function test_theme_is_validated_versioned_and_audited(): void
    {
        $this->actingAs($this->owner());
        $theme = [...config('nexora.theme'), 'primary' => '#22AABB', 'mode' => 'dark'];
        $this->putJson('/api/v1/workspace/theme', ['revision' => 1, 'theme' => $theme])->assertOk()->assertJsonPath('revision', 2);
        $this->getJson('/api/v1/auth/me')->assertJsonPath('settings.theme.primary', '#22AABB');
        $this->assertDatabaseCount('theme_versions', 2);
        $this->assertDatabaseHas('audit_logs', ['action' => 'theme.published']);
        $this->putJson('/api/v1/workspace/theme', ['revision' => 2, 'theme' => [...$theme, 'script' => 'alert(1)']])->assertUnprocessable();
        $this->putJson('/api/v1/workspace/theme', ['revision' => 2, 'theme' => [...$theme, 'primary' => 'url(javascript:evil)']])->assertUnprocessable();
    }

    public function test_stale_theme_revision_does_not_overwrite_published_theme(): void
    {
        $this->actingAs($this->owner());
        $this->putJson('/api/v1/workspace/theme', ['revision' => 1, 'theme' => config('nexora.theme')])->assertOk();
        $this->putJson('/api/v1/workspace/theme', ['revision' => 1, 'theme' => [...config('nexora.theme'), 'primary' => '#000000']])->assertConflict();
        $this->assertDatabaseCount('theme_versions', 2);
        $this->assertDatabaseHas('workspace_settings', ['revision' => 2]);
    }

    public function test_company_can_only_update_whitelisted_preferences(): void
    {
        $user = $this->owner();
        $this->actingAs($user)->putJson('/api/v1/workspace/company', ['name' => 'Nuevo nombre', 'business_type' => 'cafe', 'currency' => 'COP', 'timezone' => 'America/Bogota', 'locale' => 'es-CO'])->assertOk()->assertJsonPath('name', 'Nuevo nombre');
        $this->putJson('/api/v1/workspace/company', ['status' => 'suspended'])->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_password_recovery_sends_real_notification_and_returns_generic_response(): void
    {
        Notification::fake();
        $user = $this->owner();
        $known = $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk()->json();
        $unknown = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'unknown@example.test'])->assertOk()->json();
        $this->assertSame($known, $unknown);
        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_password_reset_revokes_sessions_and_tokens_are_single_use(): void
    {
        $user = $this->owner();
        $token = Password::createToken($user);
        DB::table('sessions')->insert(['id' => 'other-device', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        $payload = ['email' => $user->email, 'token' => $token, 'password' => 'NuevaNexora456', 'password_confirmation' => 'NuevaNexora456'];
        $this->postJson('/api/v1/auth/reset-password', $payload)->assertOk();
        $this->assertTrue(Hash::check('NuevaNexora456', $user->fresh()->password));
        $this->assertDatabaseMissing('sessions', ['id' => 'other-device']);
        $this->postJson('/api/v1/auth/reset-password', $payload)->assertUnprocessable();
    }

    public function test_user_factory_requires_and_respects_the_company_context(): void
    {
        $owner = $this->owner();
        $employee = app(TenantContext::class)->run($owner->tenant_id, fn () => User::factory()->create());
        $this->assertSame($owner->tenant_id, $employee->tenant_id);
        $this->assertDatabaseHas('roles', ['id' => $employee->role_id, 'tenant_id' => $owner->tenant_id, 'name' => 'Cajero']);
    }

    public function test_multibyte_password_does_not_exceed_bcrypt_byte_limit(): void
    {
        $password = 'Aa1'.str_repeat('🙂', 18);
        $this->postJson('/api/v1/auth/register', [...$this->payload(), 'password' => $password, 'password_confirmation' => $password])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertDatabaseCount('tenants', 0);
    }
}
