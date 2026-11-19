<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

class ScreenSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->withSession([]);
        $this->withCredentials();
        $this->withCookie(config('session.cookie'), $this->app['session']->driver()->getId());
    }

    private function owner(string $email = 'screen@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Nexora', 'business_type' => 'restaurant',
            'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function configure(int $revision = 1, ?string $pin = '839205'): array
    {
        return ['current_password' => 'SeguraNexora123', 'pin' => $pin, 'pin_confirmation' => $pin, 'revision' => $revision];
    }

    private function lock(): string
    {
        return $this->postJson('/api/v1/auth/screen/lock')->assertOk()->assertJsonPath('locked', true)->json('challenge');
    }

    private function unlock(string $challenge, string $credential = '839205', string $method = 'pin')
    {
        return $this->postJson('/api/v1/auth/screen/unlock', compact('challenge', 'credential', 'method'));
    }

    public function test_pin_is_personal_hashed_revisioned_and_never_exposed(): void
    {
        $user = $this->owner();
        $other = $this->owner('other@example.test');
        $this->actingAs($user);
        $this->putJson('/api/v1/auth/security', $this->configure())->assertOk()->assertJsonPath('pin_enabled', true)->assertJsonPath('revision', 2);
        $this->assertTrue(Hash::check('839205', $user->fresh()->pin_hash));
        $this->assertNull($other->fresh()->pin_hash);
        $this->assertArrayNotHasKey('pin_hash', $user->fresh()->toArray());
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('security.pin_enabled', true)->assertDontSee('839205');
        $this->getJson('/api/v1/workspace/team')->assertOk()->assertDontSee('pin_hash');
        $this->putJson('/api/v1/auth/security', $this->configure())->assertConflict();
        $this->putJson('/api/v1/auth/security', $this->configure(2, null))->assertOk()->assertJsonPath('pin_enabled', false)->assertJsonPath('revision', 3);
        $this->assertNull($user->fresh()->pin_hash);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'action' => 'auth.pin_configured']);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'action' => 'auth.pin_removed']);
        $this->assertStringNotContainsString('839205', DB::table('audit_logs')->get()->toJson());
        $this->assertStringNotContainsString('SeguraNexora123', DB::table('audit_logs')->get()->toJson());
    }

    public function test_invalid_password_pin_and_target_injection_cannot_change_credentials(): void
    {
        $user = $this->owner();
        $this->actingAs($user);
        $this->putJson('/api/v1/auth/security', [...$this->configure(), 'current_password' => 'wrong'])->assertUnprocessable();
        $this->putJson('/api/v1/auth/security', [...$this->configure(), 'pin' => '12345', 'pin_confirmation' => '12345'])->assertUnprocessable();
        $this->putJson('/api/v1/auth/security', [...$this->configure(), 'pin_confirmation' => '111111'])->assertUnprocessable();
        $this->putJson('/api/v1/auth/security', [...$this->configure(), 'user_id' => $user->id, 'tenant_id' => $user->tenant_id])->assertUnprocessable();
        $this->assertNull($user->fresh()->pin_hash);
        $this->assertEquals(1, $user->fresh()->security_revision);
    }

    public function test_lock_blocks_business_reads_bound_resources_and_money_commands_without_writes(): void
    {
        $this->actingAs($this->owner());
        $this->getJson('/api/v1/auth/me')->assertOk();
        $before = ['sales' => DB::table('sales')->count(), 'cash_movements' => DB::table('cash_movements')->count()];
        $challenge = $this->lock();
        $this->assertSame($challenge, $this->lock());
        foreach (['workspace/commercial-dashboard', 'branches', 'orders/999999', 'products/999999/images/999999', 'auth/sessions'] as $path) {
            $this->getJson('/api/v1/'.$path)->assertStatus(423)->assertJsonPath('code', 'screen_locked');
        }
        $this->postJson('/api/v1/orders/999999/collect', ['idempotency_key' => (string) Str::uuid()])->assertStatus(423);
        $this->putJson('/api/v1/auth/security', $this->configure())->assertStatus(423);
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('security.locked', true);
        $this->getJson('/api/v1/auth/security')->assertOk()->assertJsonPath('locked', true);
        foreach ($before as $table => $count) {
            $this->assertDatabaseCount($table, $count);
        }
        $this->assertDatabaseCount('screen_locks', 1);
        $this->assertSame(64, strlen(DB::table('screen_locks')->value('session_hash')));
        $this->assertNotSame($this->app['session']->driver()->getId(), DB::table('screen_locks')->value('session_hash'));
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertDatabaseCount('screen_locks', 0);
    }

    public function test_unlock_requires_current_own_credential_and_challenge_and_preserves_permissions(): void
    {
        $user = $this->owner();
        $this->actingAs($user);
        $this->putJson('/api/v1/auth/security', $this->configure())->assertOk();
        $challenge = $this->lock();
        $this->unlock($challenge, '000000')->assertUnprocessable();
        $this->getJson('/api/v1/branches')->assertStatus(423);
        $this->unlock((string) Str::uuid())->assertConflict();
        $this->unlock($challenge)->assertOk()->assertJsonPath('locked', false);
        $this->getJson('/api/v1/branches')->assertOk();
        $next = $this->lock();
        $this->assertNotSame($challenge, $next);
        $this->unlock($challenge)->assertConflict();
        $this->getJson('/api/v1/branches')->assertStatus(423);
        $this->unlock($next, 'SeguraNexora123', 'password')->assertOk()->assertJsonPath('locked', false);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.unlock_failed', 'actor_id' => $user->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.screen_unlocked', 'actor_id' => $user->id]);
    }

    public function test_unlock_is_rate_limited_by_account_and_wrong_attempts_keep_lock(): void
    {
        $this->actingAs($this->owner());
        $challenge = $this->lock();
        for ($i = 0; $i < 5; $i++) {
            $this->unlock($challenge, 'wrong', 'password')->assertUnprocessable();
        }
        $this->unlock($challenge, 'SeguraNexora123', 'password')->assertTooManyRequests();
        $this->assertDatabaseCount('screen_locks', 1);
        $this->travel(61)->seconds();
        $this->unlock($challenge, 'SeguraNexora123', 'password')->assertOk();
    }

    public function test_screen_lock_is_scoped_to_actor_and_foreign_pin_cannot_unlock(): void
    {
        $a = $this->owner();
        $b = $this->owner('foreign@example.test');
        $b->forceFill(['pin_hash' => Hash::make('542719')])->save();
        $this->actingAs($a);
        $challenge = $this->lock();
        $this->unlock($challenge, '542719')->assertUnprocessable();
        $this->actingAs($b);
        $this->getJson('/api/v1/auth/security')->assertOk()->assertJsonPath('locked', false);
        $this->getJson('/api/v1/branches')->assertOk();
        $this->actingAs($a);
        $this->getJson('/api/v1/branches')->assertStatus(423);
        $this->unlock($challenge, 'SeguraNexora123', 'password')->assertOk();
    }

    public function test_guests_inactive_accounts_and_csrf_are_enforced(): void
    {
        $this->postJson('/api/v1/auth/screen/lock')->assertUnauthorized();
        $this->putJson('/api/v1/auth/security', $this->configure())->assertUnauthorized();
        $user = $this->owner();
        $user->forceFill(['is_active' => false])->save();
        $this->actingAs($user)->postJson('/api/v1/auth/screen/lock')->assertForbidden();
        $user->forceFill(['is_active' => true])->save();
        $this->actingAs($user);
        $this->app->instance('env', 'local');
        $this->postJson('/api/v1/auth/screen/lock')->assertStatus(419);
        $this->putJson('/api/v1/auth/security', $this->configure())->assertStatus(419);
        $this->postJson('/api/v1/auth/screen/unlock')->assertStatus(419);
    }

    public function test_password_recovery_removes_pin_and_locks_and_revokes_database_sessions(): void
    {
        Notification::fake();
        $user = $this->owner();
        $this->actingAs($user);
        $this->putJson('/api/v1/auth/security', $this->configure())->assertOk();
        $this->lock();
        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk();
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });
        $this->postJson('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => $token,
            'password' => 'NuevaSeguraNexora123', 'password_confirmation' => 'NuevaSeguraNexora123'])->assertOk();
        $this->assertNull($user->fresh()->pin_hash);
        $this->assertEquals(3, $user->fresh()->security_revision);
        $this->assertDatabaseCount('screen_locks', 0);
        $this->assertDatabaseCount('sessions', 0);
        $this->assertGuest('web');
    }

    public function test_failed_audit_rolls_back_pin_lock_and_unlock(): void
    {
        $user = $this->owner();
        $this->actingAs($user);
        $event = 'eloquent.creating: '.AuditLog::class;
        $reject = true;
        $fail = function () use (&$reject) {
            if ($reject) {
                throw new \RuntimeException('Audit unavailable');
            }
        };
        Event::listen($event, $fail);
        try {
            $this->putJson('/api/v1/auth/security', $this->configure())->assertStatus(500);
            $this->assertNull($user->fresh()->pin_hash);
            $this->assertEquals(1, $user->fresh()->security_revision);
            $this->postJson('/api/v1/auth/screen/lock')->assertStatus(500);
            $this->assertDatabaseCount('screen_locks', 0);
        } finally {
            $reject = false;
        }
        $challenge = $this->lock();
        $reject = true;
        try {
            $this->unlock($challenge, 'SeguraNexora123', 'password')->assertStatus(500);
            $this->assertDatabaseCount('screen_locks', 1);
        } finally {
            $reject = false;
        }
        $this->getJson('/api/v1/branches')->assertStatus(423);
    }

    public function test_database_prevents_foreign_user_in_lock(): void
    {
        $a = $this->owner();
        $b = $this->owner('fk@example.test');
        $this->expectException(QueryException::class);
        DB::table('screen_locks')->insert(['session_hash' => str_repeat('a', 64), 'tenant_id' => $a->tenant_id,
            'user_id' => $b->id, 'challenge' => (string) Str::uuid(), 'created_at' => now()]);
    }
}
