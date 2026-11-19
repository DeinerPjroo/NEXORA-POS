<?php

namespace Tests\Feature;

use App\Domains\Identity\MultiFactor;
use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Identity\Totp;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use PragmaRX\Google2FA\Google2FA;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class MfaConcurrencyTest extends TestCase
{
    use DatabaseTruncation;

    protected function beforeTruncatingDatabase(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            $this->beforeApplicationDestroyed(function () {
                $name = DB::getDatabaseName();
                if (! preg_match('/^nexora_test_[a-f0-9]{16}$/D', $name) || getenv('NEXORA_ISOLATED_DATABASE') !== $name) {
                    throw new \LogicException('La limpieza exige el esquema SQL aislado.');
                }
                $this->truncateTablesForAllConnections();
            });

            return;
        }
        RefreshDatabaseState::$migrated = false;
        $this->beforeApplicationDestroyed(fn () => RefreshDatabaseState::$migrated = false);
    }

    public function test_two_processes_cannot_consume_the_same_recovery_or_totp_code(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            $this->markTestSkipped('Requiere dos conexiones SQL reales mediante scripts/test-mysql.php.');
        }
        PermissionCatalog::seed();
        $user = app(RegisterCompany::class)->execute(['company_name' => 'MFA SQL', 'business_type' => 'restaurant',
            'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'concurrent-mfa@example.test', 'password' => 'SeguraNexora123']);
        $code = strtoupper(bin2hex(random_bytes(16)));
        $user->forceFill(['mfa_enabled_at' => now(), 'mfa_version' => 2, 'mfa_secret' => app(Totp::class)->secret(),
            'mfa_recovery_hashes' => [hash('sha256', $code)]])->save();
        foreach (['recovery', 'totp'] as $method) {
            $credential = $method === 'recovery' ? $code : (new Google2FA)->oathTotp($user->mfa_secret, intdiv(now()->timestamp, 30));
            $input = json_encode(['pending' => ['user_id' => $user->id, 'version' => 2, 'expires_at' => now()->addMinutes(5)->timestamp,
                'password_stamp' => app(MultiFactor::class)->passwordStamp($user)], 'data' => ['method' => $method, 'credential' => $credential]], JSON_THROW_ON_ERROR);
            $workers = [];
            try {
                for ($i = 0; $i < 2; $i++) {
                    $worker = new Process([PHP_BINARY, base_path('../scripts/test-mfa-worker.php')], base_path(), ['NEXORA_MFA_TEST_WORKER' => '1']);
                    $worker->setInput($input)->setTimeout(30)->start();
                    $workers[] = $worker;
                }
                $accepted = [];
                foreach ($workers as $worker) {
                    $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                    $accepted[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR)['accepted'];
                }
                sort($accepted);
                $this->assertSame([false, true], $accepted);
                $this->assertSame([], $user->fresh()->mfa_recovery_hashes);
                $expected = $method === 'recovery' ? 1 : 2;
                $this->assertSame($expected, DB::table('audit_logs')->where('action', 'auth.login')->count());
                $this->assertSame($expected, DB::table('audit_logs')->where('action', 'auth.mfa_failed')->count());
            } finally {
                foreach ($workers as $worker) {
                    if ($worker->isRunning()) {
                        $worker->stop();
                    }
                }
            }
        }
    }
}
