<?php

namespace Tests\Feature;

use App\Domains\Identity\MultiFactor;
use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Identity\Totp;
use Illuminate\Support\Facades\DB;
use PragmaRX\Google2FA\Google2FA;
use Tests\SqlConcurrencyTestCase;

class MfaConcurrencyTest extends SqlConcurrencyTestCase
{
    public function test_two_processes_cannot_consume_the_same_recovery_or_totp_code(): void
    {
        $this->requireSql();
        PermissionCatalog::seed();
        $user = app(RegisterCompany::class)->execute(['company_name' => 'MFA SQL', 'business_type' => 'restaurant',
            'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'concurrent-mfa@example.test', 'password' => 'SeguraNexora123']);
        $code = strtoupper(bin2hex(random_bytes(16)));
        $user->forceFill(['mfa_enabled_at' => now(), 'mfa_version' => 2, 'mfa_secret' => app(Totp::class)->secret(),
            'mfa_recovery_hashes' => [hash('sha256', $code)]])->save();
        foreach (['recovery', 'totp'] as $method) {
            $credential = $method === 'recovery' ? $code : (new Google2FA)->oathTotp($user->mfa_secret, intdiv(now()->timestamp, 30));
            $input = ['pending' => ['user_id' => $user->id, 'version' => 2, 'expires_at' => now()->addMinutes(5)->timestamp,
                'password_stamp' => app(MultiFactor::class)->passwordStamp($user)], 'data' => ['method' => $method, 'credential' => $credential]];
            $accepted = array_column($this->race([$input, $input]), 'accepted');
            sort($accepted);
            $this->assertSame([false, true], $accepted);
            $this->assertSame([], $user->fresh()->mfa_recovery_hashes);
            $expected = $method === 'recovery' ? 1 : 2;
            $this->assertSame($expected, DB::table('audit_logs')->where('action', 'auth.login')->count());
            $this->assertSame($expected, DB::table('audit_logs')->where('action', 'auth.mfa_failed')->count());
        }
    }
}
