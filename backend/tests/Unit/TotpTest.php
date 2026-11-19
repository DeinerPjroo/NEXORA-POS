<?php

namespace Tests\Unit;

use App\Domains\Identity\Totp;
use Carbon\CarbonImmutable;
use Tests\TestCase;

class TotpTest extends TestCase
{
    public function test_rfc6238_sha1_vectors_at_six_digits_and_single_use_steps(): void
    {
        $secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
        foreach ([59 => '287082', 1111111109 => '081804', 1111111111 => '050471', 1234567890 => '005924', 2000000000 => '279037', 20000000000 => '353130'] as $time => $code) {
            $this->travelTo(CarbonImmutable::createFromTimestamp($time));
            $step = intdiv($time, 30);
            $this->assertSame($step, app(Totp::class)->verify($secret, $code, null));
            $this->assertFalse(app(Totp::class)->verify($secret, $code, $step));
        }
        $this->assertFalse(app(Totp::class)->verify($secret, '123', null));
    }
}
