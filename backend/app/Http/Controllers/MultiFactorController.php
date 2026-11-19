<?php

namespace App\Http\Controllers;

use App\Domains\Identity\MultiFactor;
use App\Http\Requests\MfaChallengeRequest;
use App\Http\Requests\MultiFactorRequest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

final class MultiFactorController extends Controller
{
    public function show(Request $request, MultiFactor $mfa)
    {
        return response()->json($mfa->state(User::where('tenant_id', $request->user()->tenant_id)->findOrFail($request->user()->id)))
            ->header('Cache-Control', 'no-store');
    }

    public function begin(MultiFactorRequest $request, MultiFactor $mfa)
    {
        return response()->json($mfa->begin($request, $request->validated()))->header('Cache-Control', 'no-store');
    }

    public function enable(MultiFactorRequest $request, MultiFactor $mfa)
    {
        return response()->json($mfa->enable($request, $request->validated()))->header('Cache-Control', 'no-store');
    }

    public function rotate(MultiFactorRequest $request, MultiFactor $mfa)
    {
        return response()->json($mfa->manage($request, $request->validated(), false))->header('Cache-Control', 'no-store');
    }

    public function disable(MultiFactorRequest $request, MultiFactor $mfa)
    {
        return response()->json($mfa->manage($request, $request->validated(), true))->header('Cache-Control', 'no-store');
    }

    public function challenge(MfaChallengeRequest $request, MultiFactor $mfa)
    {
        $user = $mfa->challenge($request->session()->get('mfa_pending_login', []), $request->validated());
        if (! $user) {
            throw ValidationException::withMessages(['credential' => 'El código no es válido o ya se utilizó.']);
        }
        $request->session()->forget('mfa_pending_login');
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put('mfa_version', $user->mfa_version);

        return response()->json(['message' => 'Sesión iniciada.']);
    }

    public function cancel(Request $request)
    {
        $request->session()->forget('mfa_pending_login');

        return response()->noContent();
    }
}
