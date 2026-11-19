<?php

namespace App\Domains\Identity;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Support\Facades\DB;

final class EmailVerification
{
    public function deliveryAvailable(?string $mailer = null, array $seen = []): bool
    {
        $mailer ??= config('mail.default');
        if (in_array($mailer, $seen, true)) {
            return false;
        }
        $settings = config('mail.mailers.'.$mailer, []);
        $transport = $settings['transport'] ?? '';
        if (in_array($transport, ['failover', 'roundrobin'], true)) {
            $children = $settings['mailers'] ?? [];
            if (! $children) {
                return false;
            }
            foreach ($children as $child) {
                if (! $this->deliveryAvailable($child, [...$seen, $mailer])) {
                    return false;
                }
            }

            return true;
        }

        return in_array($transport, ['smtp', 'sendmail', 'ses', 'ses-v2', 'mailgun', 'postmark', 'resend'], true);
    }

    public function fulfill(User $actor, string $hash): User
    {
        return DB::transaction(function () use ($actor, $hash) {
            Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
            $user = User::where('tenant_id', $actor->tenant_id)->lockForUpdate()->findOrFail($actor->id);
            abort_unless(hash_equals(sha1($user->getEmailForVerification()), $hash), 403, 'El correo de este enlace ya no coincide con tu cuenta.');
            if (! $user->hasVerifiedEmail()) {
                $user->markEmailAsVerified();
                Audit::record('auth.email_verified', 'Se verificó el correo de la cuenta.', $user);
                event(new Verified($user));
            }

            return $user;
        });
    }
}
