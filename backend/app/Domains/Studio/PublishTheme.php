<?php

namespace App\Domains\Studio;

use App\Domains\Identity\Audit;
use App\Models\ThemeVersion;
use App\Models\User;
use App\Models\WorkspaceSetting;
use Illuminate\Support\Facades\DB;

final class PublishTheme
{
    public function execute(array $data, User $actor): WorkspaceSetting
    {
        return DB::transaction(function () use ($data, $actor) {
            $setting = WorkspaceSetting::query()->lockForUpdate()->firstOrFail();
            abort_if($setting->revision !== (int) $data['revision'], 409, 'Otra persona actualizó el diseño. Recarga la página antes de publicar.');
            $setting->update(['theme' => $data['theme'], 'revision' => $setting->revision + 1]);
            ThemeVersion::create(['version' => $setting->revision, 'schema_version' => 1, 'theme' => $setting->theme, 'created_at' => now()]);
            Audit::record('theme.published', 'Se publicó la versión '.$setting->revision.' de la identidad visual.', $actor);

            return $setting;
        });
    }
}
