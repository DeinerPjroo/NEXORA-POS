<?php

namespace App\Http\Controllers;

use App\Domains\Kitchen\KitchenRealtime;
use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Gate;

final class KitchenRealtimeController extends Controller
{
    public function show(Request $request)
    {
        Gate::authorize('kitchen.view');
        $data = $request->validate(['branch_id' => ['required', 'integer', 'min:1']]);
        $branch = Branch::whereKey($data['branch_id'])->where('is_active', true)->firstOrFail();
        $config = config('broadcasting.connections.reverb');
        if (config('broadcasting.default') !== 'reverb' || empty($config['key']) || empty($config['secret']) || empty($config['app_id']) || empty($config['options']['host'])) {
            return response()->json(['enabled' => false])->header('Cache-Control', 'no-store');
        }

        return response()->json(['enabled' => true, 'key' => $config['key'], 'host' => $config['options']['host'],
            'port' => (int) $config['options']['port'], 'scheme' => $config['options']['scheme'],
            'channel' => 'kitchen.'.$request->user()->tenant_id.'.'.$branch->id])->header('Cache-Control', 'no-store');
    }

    public function authorize(Request $request)
    {
        Gate::authorize('kitchen.view');
        abort_unless(config('broadcasting.default') === 'reverb', 503);
        $request->validate(['socket_id' => ['required', 'string', 'regex:/^\d+\.\d+$/', 'max:100'],
            'channel_name' => ['required', 'string', 'regex:/^private-kitchen\.\d+\.\d+$/', 'max:150']]);

        $broadcaster = Broadcast::connection('reverb');
        $broadcaster->channel('kitchen.{tenant}.{branch}', fn ($user, $tenant, $branch) => KitchenRealtime::authorize($user, $tenant, $branch));

        return $broadcaster->auth($request);
    }
}
