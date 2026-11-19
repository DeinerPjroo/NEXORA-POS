<?php

namespace Tests\Feature;

use App\Domains\Identity\EmailVerification;
use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->withSession([])->withCredentials()->withCookie(config('session.cookie'), $this->app['session']->driver()->getId());
    }

    private function owner(string $email = 'verify@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Correo', 'business_type' => 'restaurant',
            'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function signed(User $user, ?string $hash = null): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addMinutes(60),
            ['id' => $user->id, 'hash' => $hash ?? sha1($user->email)], absolute: false);
    }

    public function test_notification_uses_real_laravel_signed_contract_and_confirmation_is_idempotent(): void
    {
        Notification::fake();
        config(['mail.default' => 'smtp']);
        $user = $this->owner();
        $this->actingAs($user);
        $before = $this->getJson('/api/v1/auth/me')->assertOk()->json('permissions');
        $this->getJson('/api/v1/auth/email-verification')->assertOk()->assertJsonPath('verified', false)->assertJsonPath('delivery_available', true);
        $this->postJson('/api/v1/auth/email-verification')->assertAccepted();
        $path = null;
        Notification::assertSentTo($user, VerifyEmail::class, function ($notification) use ($user, &$path) {
            $mail = $notification->toMail($user);
            $this->assertSame('Verifica tu correo en Nexora POS', $mail->subject);
            parse_str(parse_url($mail->actionUrl, PHP_URL_QUERY), $query);
            $path = $query['verificacion'];
            $this->assertSame($this->signed($user), $path);

            return true;
        });
        $this->assertNull($user->fresh()->email_verified_at);
        $this->postJson($path)->assertOk()->assertJsonPath('message', 'Tu correo está verificado.');
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->postJson($path)->assertOk();
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'auth.email_verified')->count());
        $this->assertSame($before, $this->getJson('/api/v1/auth/me')->assertOk()->json('permissions'));
        $this->assertStringNotContainsString('signature', DB::table('audit_logs')->get()->toJson());
        $this->actingAs($user->fresh())->postJson('/api/v1/auth/email-verification')->assertOk();
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);
    }

    public function test_missing_tampered_and_expired_signatures_never_verify(): void
    {
        $user = $this->owner();
        $this->actingAs($user);
        $path = $this->signed($user);
        $this->postJson(strtok($path, '?'))->assertForbidden();
        $this->postJson($path.'&extra=1')->assertForbidden();
        $this->travel(61)->minutes();
        $this->postJson($path)->assertForbidden();
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_foreign_account_and_wrong_or_changed_email_are_rejected(): void
    {
        $a = $this->owner();
        $b = $this->owner('foreign@example.test');
        $this->actingAs($a)->postJson($this->signed($b))->assertForbidden();
        $this->postJson($this->signed($a, sha1('other@example.test')))->assertForbidden();
        $path = $this->signed($a);
        DB::table('users')->where('id', $a->id)->update(['email' => 'changed@example.test']);
        // Also reject when an authenticated model predates a concurrent email change.
        $this->postJson($path)->assertForbidden();
        $this->assertNull($a->fresh()->email_verified_at);
        $this->assertNull($b->fresh()->email_verified_at);
    }

    public function test_local_log_array_and_failover_to_log_do_not_claim_delivery(): void
    {
        Notification::fake();
        $this->actingAs($this->owner());
        foreach (['log', 'array', 'failover'] as $mailer) {
            config(['mail.default' => $mailer]);
            $this->getJson('/api/v1/auth/email-verification')->assertOk()->assertJsonPath('delivery_available', false);
            $this->postJson('/api/v1/auth/email-verification')->assertStatus(503);
        }
        Notification::assertNothingSent();
        config(['mail.mailers.cycle' => ['transport' => 'failover', 'mailers' => ['cycle']]]);
        $this->assertFalse(app(EmailVerification::class)->deliveryAvailable('cycle'));
    }

    public function test_notification_is_limited_own_account_only_and_delivery_failures_are_generic(): void
    {
        Notification::fake();
        config(['mail.default' => 'smtp']);
        $user = $this->owner();
        $this->actingAs($user);
        $this->postJson('/api/v1/auth/email-verification', ['email' => 'other@example.test', 'tenant_id' => 5, 'user_id' => 1])->assertUnprocessable();
        Notification::shouldReceive('send')->once()->andThrow(new \RuntimeException('SMTP secret diagnostics'));
        $this->postJson('/api/v1/auth/email-verification')->assertStatus(503)->assertDontSee('SMTP secret diagnostics');
        // The limiter is per account; invalid requests and service errors cannot bypass it.
        $this->postJson('/api/v1/auth/email-verification', ['email' => 'other@example.test'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/email-verification')->assertTooManyRequests();
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_guests_csrf_and_locked_sessions_cannot_confirm_or_send(): void
    {
        $user = $this->owner();
        $path = $this->signed($user);
        $this->postJson($path)->assertUnauthorized();
        $this->postJson('/api/v1/auth/email-verification')->assertUnauthorized();
        $this->actingAs($user);
        $this->postJson('/api/v1/auth/screen/lock')->assertOk();
        $this->postJson($path)->assertStatus(423);
        $this->postJson('/api/v1/auth/email-verification')->assertStatus(423);
        $this->app->instance('env', 'local');
        $this->postJson($path)->assertStatus(419);
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_audit_failure_rolls_back_verification(): void
    {
        $user = $this->owner();
        $this->actingAs($user);
        Event::listen('eloquent.creating: '.AuditLog::class, fn () => throw new \RuntimeException('Audit unavailable'));
        $this->postJson($this->signed($user))->assertStatus(500);
        $this->assertNull($user->fresh()->email_verified_at);
    }
}
