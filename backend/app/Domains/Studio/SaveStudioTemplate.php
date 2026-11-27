<?php

namespace App\Domains\Studio;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\StudioTemplate;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

final class SaveStudioTemplate
{
    public function execute(User $actor, array $data): StudioTemplate
    {
        Gate::authorize('studio.view');
        Gate::authorize('studio.edit');

        return app(IdempotentOperation::class)->run($actor, 'studio.template.'.$data['action'], $data, StudioTemplate::class, function ($data) use ($actor) {
            $source = $data['action'] === 'create' ? null : StudioTemplate::where('surface', 'pos')->whereKey($data['template_id'])->lockForUpdate()->firstOrFail();
            abort_if($source && $source->revision !== (int) $data['revision'], 409, 'La plantilla cambió. Carga la revisión actual.');
            $name = trim($data['name']);
            abort_if(StudioTemplate::where('surface', 'pos')->where('name', $name)->when($data['action'] === 'rename', fn ($q) => $q->whereKeyNot($source->id))->exists(), 422, 'Ya existe una plantilla con ese nombre.');
            if ($data['action'] === 'rename') {
                $template = $source;
                $template->revision++;
            } else {
                abort_if(StudioTemplate::where('surface', 'pos')->count() >= 50, 422, 'Puedes conservar hasta 50 plantillas personales.');
                $configuration = PosLayoutSchema::validate($source?->configuration ?? $data['configuration']);
                $template = new StudioTemplate(['surface' => 'pos', 'configuration' => $configuration, 'revision' => 1]);
            }
            $template->name = $name;
            $template->updated_by = $actor->id;
            $template->save();
            Audit::record('studio.template.'.$data['action'], 'Se guardó una plantilla personal de Terminal.', $actor, ['template_id' => $template->id, 'source_id' => $source?->id, 'revision' => $template->revision, 'name' => $template->name]);

            return $template;
        });
    }
}
