<?php

namespace App\Domains\Identity;

use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use PragmaRX\Google2FA\Google2FA;

final class Totp
{
    public function secret(): string
    {
        return (new Google2FA)->generateSecretKey(32);
    }

    public function verify(#[\SensitiveParameter] string $secret, #[\SensitiveParameter] string $code, ?int $lastStep): int|false
    {
        if (! preg_match('/^[0-9]{6}$/D', $code)) {
            return false;
        }
        $step = (new Google2FA)->verifyKeyNewer($secret, $code, $lastStep ?? -1, 1, intdiv(now()->timestamp, 30));

        return is_int($step) ? $step : false;
    }

    public function provisioning(string $email, #[\SensitiveParameter] string $secret): array
    {
        $uri = (new Google2FA)->getQRCodeUrl('Nexora POS', $email, $secret);
        $svg = (new Writer(new ImageRenderer(new RendererStyle(240, 4), new SvgImageBackEnd)))->writeString($uri);

        return ['secret' => $secret, 'qr_image' => 'data:image/svg+xml;base64,'.base64_encode($svg)];
    }
}
