<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Models\AuditLog;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class MultiFactorTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->withSession([])->withCredentials();
        $this->keepCookie();
        $this->travelTo(CarbonImmutable::parse('2026-11-19T12:00:05-05:00'));
    }

    private function keepCookie(): void
    {
        $this->withCookie(config('session.cookie'), $this->app['session']->driver()->getId());
        Auth::forgetGuards();
    }

    private function owner(string $email = 'mfa@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'MFA', 'business_type' => 'restaurant',
            'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function code(string $secret): string
    {
        return (new Google2FA)->oathTotp($secret, intdiv(now()->timestamp, 30));
    }

    private function enrollSetup(User $user): array
    {
        $this->actingAs($user);

        return $this->postJson('/api/v1/auth/mfa/setup', ['current_password' => 'SeguraNexora123', 'revision' => 1])->assertOk()->json();
    }

    private function activate(User $user): array
    {
        $setup = $this->enrollSetup($user);
        $response = $this->postJson('/api/v1/auth/mfa/enable', ['current_password' => 'SeguraNexora123', 'revision' => $setup['revision'],
            'pending_id' => $setup['pending_id'], 'credential' => $this->code($setup['secret'])])->assertOk()->assertJsonPath('enabled', true);
        $this->actingAs($user->fresh());

        return [...$response->json(), 'secret' => $setup['secret']];
    }

    private function login(User $user): void
    {
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->keepCookie();
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'SeguraNexora123'])->assertAccepted()->assertJsonPath('mfa_required', true);
        $this->keepCookie();
        $this->assertGuest('web');
    }

    public function test_setup_requires_password_and_proof_and_stores_only_encrypted_credentials(): void
    {
        $user = $this->owner();
        $setup = $this->enrollSetup($user);
        $this->assertSame(32, strlen($setup['secret']));
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $setup['qr_image']);
        $this->assertNull($user->fresh()->mfa_enabled_at);
        $this->assertNotSame($setup['secret'], DB::table('users')->where('id', $user->id)->value('mfa_pending_secret'));
        $this->postJson('/api/v1/auth/mfa/enable', ['current_password' => 'SeguraNexora123', 'revision' => 2,
            'pending_id' => $setup['pending_id'], 'credential' => $this->code($setup['secret'])])->assertOk()->assertJsonPath('recovery_remaining', 8);
        $fresh = $user->fresh();
        $this->assertNotNull($fresh->mfa_enabled_at);
        $this->assertNull($fresh->mfa_pending_secret);
        $this->assertCount(8, $fresh->mfa_recovery_hashes);
        $this->assertNotSame($setup['secret'], DB::table('users')->where('id', $user->id)->value('mfa_secret'));
        $this->assertArrayNotHasKey('mfa_secret', $fresh->toArray());
        $this->assertArrayNotHasKey('mfa_recovery_hashes', $fresh->toArray());
        $this->assertStringNotContainsString($setup['secret'], DB::table('audit_logs')->get()->toJson());
        $this->actingAs($fresh)->getJson('/api/v1/auth/mfa')->assertOk()->assertJsonPath('enabled', true)->assertDontSee($setup['secret'])->assertDontSee('recovery_codes');
    }

    public function test_wrong_password_revision_pending_id_and_expiry_cannot_enable_mfa(): void
    {
        $user = $this->owner();
        $this->actingAs($user)->postJson('/api/v1/auth/mfa/setup', ['current_password' => 'wrong', 'revision' => 1])->assertUnprocessable();
        $setup = $this->enrollSetup($user);
        $data = ['current_password' => 'SeguraNexora123', 'revision' => 2, 'pending_id' => $setup['pending_id'], 'credential' => $this->code($setup['secret'])];
        $this->postJson('/api/v1/auth/mfa/enable', [...$data, 'pending_id' => (string) Str::uuid()])->assertConflict();
        $this->postJson('/api/v1/auth/mfa/enable', [...$data, 'revision' => 1])->assertConflict();
        $this->postJson('/api/v1/auth/mfa/enable', [...$data, 'credential' => '000000'])->assertUnprocessable();
        $this->travel(11)->minutes();
        $this->postJson('/api/v1/auth/mfa/enable', $data)->assertConflict();
        $this->assertNull($user->fresh()->mfa_enabled_at);
    }

    public function test_password_phase_has_no_access_and_recovery_code_is_consumed_once(): void
    {
        $user = $this->owner();
        $active = $this->activate($user);
        $this->login($user);
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->getJson('/api/v1/branches')->assertUnauthorized();
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => $active['recovery_codes'][0]])->assertOk();
        $this->keepCookie();
        $this->getJson('/api/v1/branches')->assertOk();
        $this->assertCount(7, $user->fresh()->mfa_recovery_hashes);
        $this->login($user);
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => $active['recovery_codes'][0]])->assertUnprocessable();
        $this->assertGuest('web');
        $this->assertCount(7, $user->fresh()->mfa_recovery_hashes);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.mfa_failed', 'actor_id' => $user->id]);
    }

    public function test_totp_cannot_be_reused_after_enrollment_and_new_step_can_login(): void
    {
        $user = $this->owner();
        $active = $this->activate($user);
        $this->login($user);
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'totp', 'credential' => $this->code($active['secret'])])->assertUnprocessable();
        $this->travel(31)->seconds();
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'totp', 'credential' => $this->code($active['secret'])])->assertOk();
        $this->keepCookie();
        $this->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_rotating_and_disabling_require_factor_and_revoke_other_sessions(): void
    {
        $user = $this->owner();
        $active = $this->activate($user);
        DB::table('sessions')->insert(['id' => 'other-session', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        $data = ['current_password' => 'SeguraNexora123', 'revision' => 3, 'method' => 'recovery', 'credential' => $active['recovery_codes'][0]];
        $next = $this->postJson('/api/v1/auth/mfa/recovery-codes', $data)->assertOk()->assertJsonPath('recovery_remaining', 8)->json();
        $this->assertDatabaseMissing('sessions', ['id' => 'other-session']);
        $this->actingAs($user->fresh());
        $this->postJson('/api/v1/auth/mfa/disable', [...$data, 'revision' => 4, 'credential' => $active['recovery_codes'][1]])->assertUnprocessable();
        $this->postJson('/api/v1/auth/mfa/disable', [...$data, 'revision' => 4, 'credential' => $next['recovery_codes'][0]])->assertOk()->assertJsonPath('enabled', false);
        $this->assertNull($user->fresh()->mfa_secret);
        $this->assertNull($user->fresh()->mfa_recovery_hashes);
    }

    public function test_expired_challenges_fail_closed_and_are_rate_limited(): void
    {
        $user = $this->owner();
        $active = $this->activate($user);
        $this->login($user);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => 'invalid'])->assertUnprocessable();
        }
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => $active['recovery_codes'][0]])->assertTooManyRequests();
        $this->travel(6)->minutes();
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => $active['recovery_codes'][0]])->assertUnauthorized();
        $this->assertGuest('web');
        $this->assertCount(8, $user->fresh()->mfa_recovery_hashes);
    }

    public function test_stale_authenticated_session_cannot_bypass_mfa_after_a_credential_change(): void
    {
        $user = $this->owner();
        $user->forceFill(['mfa_version' => 3])->save();
        $this->actingAs($user)->withSession(['mfa_version' => 2]);
        $this->getJson('/api/v1/branches')->assertUnauthorized();
        $this->assertGuest('web');
    }

    public function test_audit_failure_rolls_back_recovery_consumption(): void
    {
        $user = $this->owner();
        $active = $this->activate($user);
        Event::listen('eloquent.creating: '.AuditLog::class, fn () => throw new \RuntimeException('Audit unavailable'));
        $this->postJson('/api/v1/auth/mfa/disable', ['current_password' => 'SeguraNexora123', 'revision' => 3,
            'method' => 'recovery', 'credential' => $active['recovery_codes'][0]])->assertStatus(500);
        $this->assertNotNull($user->fresh()->mfa_enabled_at);
        $this->assertCount(8, $user->fresh()->mfa_recovery_hashes);
        $this->assertSame(2, $user->fresh()->mfa_version);
        $this->assertSame(2, $this->app['session']->get('mfa_version'));
    }

    public function test_password_and_mfa_version_changes_invalidate_pending_challenges(): void
    {
        $user = $this->owner();
        $active = $this->activate($user);
        $this->login($user);
        DB::table('users')->where('id', $user->id)->update(['password' => bcrypt('ChangedPassword123')]);
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => $active['recovery_codes'][0]])->assertUnauthorized();
        $this->assertCount(8, $user->fresh()->mfa_recovery_hashes);
        DB::table('users')->where('id', $user->id)->update(['password' => bcrypt('SeguraNexora123')]);
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'SeguraNexora123'])->assertAccepted();
        $this->keepCookie();
        DB::table('users')->where('id', $user->id)->update(['mfa_version' => 3]);
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => $active['recovery_codes'][0]])->assertUnauthorized();
        $this->assertGuest('web');
    }

    public function test_setup_and_enable_are_personal_csrf_protected_and_audit_atomic(): void
    {
        $a = $this->owner();
        $b = $this->owner('foreign-mfa@example.test');
        $setup = $this->enrollSetup($a);
        $data = ['current_password' => 'SeguraNexora123', 'revision' => 2, 'pending_id' => $setup['pending_id'], 'credential' => $this->code($setup['secret'])];
        $this->actingAs($b)->postJson('/api/v1/auth/mfa/enable', [...$data, 'revision' => 1])->assertConflict();
        $this->postJson('/api/v1/auth/mfa/setup', ['current_password' => 'SeguraNexora123', 'revision' => 1, 'user_id' => $a->id, 'tenant_id' => $a->tenant_id])->assertUnprocessable();
        $this->actingAs($a);
        Event::listen('eloquent.creating: '.AuditLog::class, fn () => throw new \RuntimeException('Audit unavailable'));
        $this->postJson('/api/v1/auth/mfa/enable', $data)->assertStatus(500);
        $this->assertNull($a->fresh()->mfa_enabled_at);
        $this->assertNull($a->fresh()->mfa_last_step);
        $this->assertSame(2, $a->fresh()->security_revision);
        $this->assertSame(1, $a->fresh()->mfa_version);
        $this->assertNull($b->fresh()->mfa_secret);
        $this->app->instance('env', 'local');
        $this->postJson('/api/v1/auth/mfa/enable', $data)->assertStatus(419);
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => 'invalid'])->assertStatus(419);
    }

    public function test_password_recovery_preserves_mfa_and_rejects_the_old_session_version(): void
    {
        Notification::fake();
        $user = $this->owner();
        $active = $this->activate($user);
        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk();
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });
        $this->postJson('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'ChangedPassword123', 'password_confirmation' => 'ChangedPassword123'])->assertOk();
        $this->assertNotNull($user->fresh()->mfa_enabled_at);
        $this->assertSame($active['secret'], $user->fresh()->mfa_secret);
        $this->assertSame(3, $user->fresh()->mfa_version);
        $this->keepCookie();
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'ChangedPassword123'])->assertAccepted();
        $this->keepCookie();
        $this->getJson('/api/v1/branches')->assertUnauthorized();
        $this->postJson('/api/v1/auth/mfa/challenge', ['method' => 'recovery', 'credential' => $active['recovery_codes'][0]])->assertOk();
        $this->keepCookie();
        $this->getJson('/api/v1/branches')->assertOk();
    }

    public function test_revocation_advances_session_version_and_keeps_current_session_authorized(): void
    {
        $user = $this->owner();
        $this->actingAs($user)->deleteJson('/api/v1/auth/sessions', ['password' => 'SeguraNexora123'])->assertNoContent();
        $this->assertSame(2, $user->fresh()->mfa_version);
        $this->assertSame(2, $this->app['session']->get('mfa_version'));
        $this->actingAs($user->fresh())->getJson('/api/v1/branches')->assertOk();
        // Even a late request that recreated a deleted session cannot restore its old authority.
        $this->withSession(['mfa_version' => 1]);
        Auth::forgetGuards();
        $this->actingAs($user->fresh())->getJson('/api/v1/branches')->assertUnauthorized();
    }
}
