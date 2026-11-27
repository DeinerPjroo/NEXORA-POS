<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $hasLegacyIndex = Schema::getConnection()->pretending() || Schema::hasIndex('studio_layouts', 'studio_surface_identity');
        $hasScopeColumn = Schema::hasColumn('studio_layouts', 'role_scope');
        $hasScopeIndex = Schema::hasIndex('studio_layouts', 'studio_scope_identity');
        Schema::table('studio_layouts', function (Blueprint $t) use ($hasLegacyIndex, $hasScopeColumn, $hasScopeIndex) {
            if ($hasLegacyIndex) {
                $t->dropUnique('studio_surface_identity');
            }
            if (! $hasScopeColumn) {
                $column = $t->unsignedBigInteger('role_scope');
                // SQLite cannot add a STORED generated column to a populated table.
                if (Schema::getConnection()->getDriverName() === 'sqlite') {
                    $column->virtualAs('coalesce(role_id, 0)');
                } else {
                    $column->storedAs('coalesce(role_id, 0)');
                }
            }
            if (! $hasScopeIndex) {
                $t->unique(['tenant_id', 'surface', 'device', 'role_scope'], 'studio_scope_identity');
            }
        });
        if (Schema::hasTable('studio_templates')) {
            return;
        }
        Schema::create('studio_templates', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->string('surface', 30)->default('pos');
            $t->string('name', 80);
            $t->unsignedInteger('revision')->default(1);
            $t->json('configuration');
            $t->unsignedBigInteger('updated_by');
            $t->timestamps();
            $t->unique(['tenant_id', 'surface', 'name'], 'studio_template_name');
            $t->foreign(['tenant_id', 'updated_by'], 'studio_template_actor_fk')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar diseños y plantillas.');
    }
};
