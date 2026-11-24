<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('studio_layouts', function (Blueprint $t) {
            $t->dropUnique('studio_surface_identity');
            $t->unsignedBigInteger('role_scope')->storedAs('coalesce(role_id, 0)');
            $t->unique(['tenant_id', 'surface', 'device', 'role_scope'], 'studio_scope_identity');
        });
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
    public function down(): void { throw new LogicException('Conservar diseños y plantillas.'); }
};
