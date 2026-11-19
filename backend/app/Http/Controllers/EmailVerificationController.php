<?php

namespace App\Http\Controllers;

use App\Domains\Identity\Audit;
use App\Domains\Identity\EmailVerification;
use App\Http\Requests\VerificationNotificationRequest;
use App\Models\User;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

final class EmailVerificationController extends Controller
{
    public function status(Request $request, EmailVerification $verification)
    {
        return response()->json(['verified' => $request->user()->hasVerifiedEmail(),
            'delivery_available' => $verification->deliveryAvailable()]);
    }

    public function send(VerificationNotificationRequest $request, EmailVerification $verification)
    {
        $user = User::where('tenant_id', $request->user()->tenant_id)->findOrFail($request->user()->id);
        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Tu correo ya está verificado.']);
        }
        abort_unless($verification->deliveryAvailable(), 503, 'El servicio de correo todavía no está configurado. No se envió ningún enlace.');
        Audit::record('auth.verification_requested', 'Se solicitó verificar el correo personal.', $user);
        try {
            $user->sendEmailVerificationNotification();
        } catch (\Throwable $failure) {
            // Never expose SMTP diagnostics, message bodies or signed links.
            Log::warning('Email verification delivery failed.', ['exception' => get_class($failure)]);
            abort(503, 'El servicio de correo no aceptó la solicitud. Intenta más tarde.');
        }

        return response()->json(['message' => 'El servicio de correo aceptó la solicitud. Revisa tu bandeja de entrada y correo no deseado.'], 202);
    }

    public function verify(EmailVerificationRequest $request, EmailVerification $verification)
    {
        $user = $verification->fulfill($request->user(), (string) $request->route('hash'));

        return response()->json(['message' => 'Tu correo está verificado.', 'email_verified_at' => $user->email_verified_at]);
    }
}
