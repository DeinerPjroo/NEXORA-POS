<?php

namespace App\Domains\Studio;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\StudioLayout;
use App\Models\StudioVersionArchive;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class ChangeStudioVersion
{
    public function execute(User $actor, array $data, bool $archive = false): StudioLayout
    {
        Gate::authorize('studio.view');
        Gate::authorize('studio.edit');

        return app(IdempotentOperation::class)->run($actor, $archive ? 'studio.pos.archive' : 'studio.pos.restore', $data, StudioLayout::class, function ($data) use ($actor, $archive) {
            $layout = StudioLayout::where('surface', 'pos')->lockForUpdate()->firstOrFail();
            abort_unless($layout->revision === (int) $data['revision'], 409, 'El diseño cambió. Recarga antes de continuar.');
            $version = $layout->versions()->whereKey($data['version_id'])->firstOrFail();
            if ($archive) {
                abort_if(in_array($version->revision, [$layout->draft_revision, $layout->published_revision], true), 409, 'Esta versión está en uso como borrador o publicación.');
                abort_if($version->archive()->exists(), 409, 'La versión ya está archivada.');
                StudioVersionArchive::create(['studio_layout_id' => $layout->id, 'studio_layout_version_id' => $version->id, 'actor_id' => $actor->id, 'reason' => $data['reason'], 'created_at' => now()]);
            } else {
                $layout->draft = PosLayoutSchema::validate($version->configuration);
                $layout->draft_revision = $layout->revision + 1;
            }
            $layout->revision++;
            $layout->updated_by = $actor->id;
            $layout->save();
            if (! $archive) {
                $layout->versions()->create(['revision' => $layout->revision, 'kind' => 'restored', 'configuration' => $layout->draft, 'source_version_id' => $version->id, 'reason' => $data['reason'], 'actor_id' => $actor->id, 'created_at' => now()]);
            }
            Audit::record($archive ? 'studio.version.archived' : 'studio.version.restored', $archive ? 'Se archivó una versión sin eliminarla.' : 'Se restauró una versión como borrador, sin publicar.', $actor, ['layout_id' => $layout->id, 'version_id' => $version->id, 'revision' => $layout->revision, 'reason' => $data['reason']]);

            return $layout;
        });
    }
}
