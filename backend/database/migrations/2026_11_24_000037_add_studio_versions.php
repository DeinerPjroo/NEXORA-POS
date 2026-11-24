<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('studio_layouts', function (Blueprint $t) {
            $t->unique(['tenant_id', 'id'], 'studio_layout_tenant_identity');
            $t->unsignedInteger('draft_revision')->nullable();
        });
        Schema::create('studio_layout_versions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('studio_layout_id');
            $t->unsignedInteger('revision');
            $t->string('kind', 20);
            $t->json('configuration');
            $t->unsignedBigInteger('actor_id')->nullable();
            $t->unsignedBigInteger('source_version_id')->nullable();
            $t->string('reason', 300)->nullable();
            $t->timestamp('created_at');
            $t->unique(['tenant_id', 'studio_layout_id', 'revision'], 'studio_version_revision');
            $t->unique(['tenant_id', 'studio_layout_id', 'id'], 'studio_version_identity');
            $t->foreign(['tenant_id', 'studio_layout_id'], 'studio_version_layout_fk')->references(['tenant_id', 'id'])->on('studio_layouts')->restrictOnDelete();
            $t->foreign(['tenant_id', 'actor_id'], 'studio_version_actor_fk')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
            $t->foreign(['tenant_id', 'studio_layout_id', 'source_version_id'], 'studio_version_source_fk')->references(['tenant_id', 'studio_layout_id', 'id'])->on('studio_layout_versions')->restrictOnDelete();
        });
        Schema::create('studio_version_archives', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('studio_layout_id');
            $t->unsignedBigInteger('studio_layout_version_id');
            $t->unsignedBigInteger('actor_id');
            $t->string('reason', 300);
            $t->timestamp('created_at');
            $t->unique(['tenant_id', 'studio_layout_version_id'], 'studio_archive_once');
            $t->foreign(['tenant_id', 'studio_layout_id', 'studio_layout_version_id'], 'studio_archive_version_fk')->references(['tenant_id', 'studio_layout_id', 'id'])->on('studio_layout_versions')->restrictOnDelete();
            $t->foreign(['tenant_id', 'actor_id'], 'studio_archive_actor_fk')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        if (DB::connection()->pretending()) {
            return;
        }
        $this->backfill();
    }

    public function backfill(): void
    {
        DB::table('studio_layouts')->whereNull('draft_revision')->orderBy('id')->chunkById(100, function ($rows) {
            foreach ($rows as $row) {
                DB::transaction(function () use ($row) {
                    DB::table('tenants')->where('id', $row->tenant_id)->lockForUpdate()->first();
                    $row = DB::table('studio_layouts')->where('id', $row->id)->whereNull('draft_revision')->lockForUpdate()->first();
                    if (! $row) {
                        return;
                    }
                    if ($row->published !== null && $row->published_revision !== null) {
                        DB::table('studio_layout_versions')->insert(['tenant_id' => $row->tenant_id, 'studio_layout_id' => $row->id, 'revision' => $row->published_revision, 'kind' => 'published', 'configuration' => $row->published, 'actor_id' => $row->published_by, 'created_at' => $row->published_at ?? $row->updated_at]);
                    }
                    if ($row->published_revision === null || (int) $row->revision !== (int) $row->published_revision) {
                        DB::table('studio_layout_versions')->insert(['tenant_id' => $row->tenant_id, 'studio_layout_id' => $row->id, 'revision' => $row->revision, 'kind' => 'draft', 'configuration' => $row->draft, 'actor_id' => $row->updated_by, 'created_at' => $row->updated_at]);
                    }
                    DB::table('studio_layouts')->where('id', $row->id)->update(['draft_revision' => $row->revision]);
                });
            }
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar versiones e historial de Studio.');
    }
};
