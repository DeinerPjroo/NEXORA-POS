<?php

namespace App\Domains\Studio;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\StudioLayout;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class SavePosLayout
{
    public function execute(User $actor, array $data, bool $publish = false): StudioLayout
    {
        Gate::authorize('studio.view');
        Gate::authorize($publish ? 'studio.publish' : 'studio.edit');
        LayoutScope::query($data);

        return app(IdempotentOperation::class)->run($actor, $publish ? 'studio.pos.publish' : 'studio.pos.save', $data, StudioLayout::class, function ($data) use ($actor, $publish) {
            $layout = LayoutScope::query($data)->lockForUpdate()->first();
            abort_unless(($layout?->revision ?? 0) === (int) $data['revision'], 409, 'Otro administrador cambió el diseño. Conserva tus cambios y carga la revisión actual.');
            if ($publish) {
                abort_unless($layout, 409, 'Guarda primero un borrador.');
                $layout->published = LayoutScope::validateConfiguration($layout->draft, $layout->device);
                $layout->published_revision = $layout->revision + 1;
                $layout->published_by = $actor->id;
                $layout->published_at = now();
            } else {
                $layout ??= new StudioLayout([...LayoutScope::identity($data), 'revision' => 0]);
                $layout->draft = LayoutScope::validateConfiguration($data['configuration'], $layout->device);
                $layout->draft_revision = $layout->revision + 1;
            }
            $layout->revision++;
            $layout->updated_by = $actor->id;
            $layout->save();
            $layout->versions()->create(['revision' => $layout->revision, 'kind' => $publish ? 'published' : 'draft', 'configuration' => $publish ? $layout->published : $layout->draft, 'actor_id' => $actor->id, 'created_at' => now()]);
            Audit::record($publish ? 'studio.layout.published' : 'studio.layout.saved', $publish ? 'Se publicó la distribución de Terminal POS.' : 'Se guardó un borrador de Terminal POS.', $actor, ['layout_id' => $layout->id, 'revision' => $layout->revision, 'schema_version' => 1]);

            return $layout;
        });
    }
}
