<?php

namespace App\Http\Controllers;

use App\Domains\Identity\ScreenSecurity;
use App\Http\Requests\ConfigurePinRequest;
use App\Http\Requests\UnlockScreenRequest;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class ScreenSecurityController extends Controller
{
    public function show(Request $request, ScreenSecurity $security)
    {
        return response()->json($security->state($request));
    }

    public function configure(ConfigurePinRequest $request, ScreenSecurity $security)
    {
        $security->configure($request, $request->validated());

        return $this->show($request, $security);
    }

    public function lock(Request $request, ScreenSecurity $security)
    {
        $security->lock($request);

        return $this->show($request, $security);
    }

    public function unlock(UnlockScreenRequest $request, ScreenSecurity $security)
    {
        if (! $security->unlock($request, $request->validated())) {
            throw ValidationException::withMessages(['credential' => 'No se pudo desbloquear. Revisa tu PIN o contraseña.']);
        }

        return $this->show($request, $security);
    }
}
