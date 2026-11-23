<?php

use App\Domains\Identity\PermissionCatalog;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('studio_layouts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->string('surface', 30);
            $t->string('device', 20)->default('adaptive');
            $t->unsignedBigInteger('branch_id')->nullable();
            $t->unsignedBigInteger('role_id')->nullable();
            $t->unsignedInteger('revision')->default(1);
            $t->json('draft');
            $t->json('published')->nullable();
            $t->unsignedInteger('published_revision')->nullable();
            $t->unsignedBigInteger('updated_by');
            $t->unsignedBigInteger('published_by')->nullable();
            $t->timestamp('published_at')->nullable();
            $t->timestamps();
            $t->unique(['tenant_id', 'surface'], 'studio_surface_identity');
            $t->foreign(['tenant_id', 'branch_id'], 'studio_branch_fk')->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
            $t->foreign(['tenant_id', 'role_id'], 'studio_role_fk')->references(['tenant_id', 'id'])->on('roles')->restrictOnDelete();
            $t->foreign(['tenant_id', 'updated_by'], 'studio_editor_fk')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
            $t->foreign(['tenant_id', 'published_by'], 'studio_publisher_fk')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        if (DB::connection()->pretending()) {
            return;
        }
        PermissionCatalog::seed();
        $legacy = DB::table('permissions')->where('key', 'studio.manage')->value('id');
        $new = DB::table('permissions')->whereIn('key', ['studio.edit', 'studio.publish'])->pluck('id');
        foreach (DB::table('role_permission')->where('permission_id', $legacy)->get() as $grant) {
            foreach ($new as $id) {
                DB::table('role_permission')->insertOrIgnore(['tenant_id' => $grant->tenant_id, 'role_id' => $grant->role_id, 'permission_id' => $id]);
            }
        }
    }

    public function down(): void
    {
        throw new LogicException('Conservar configuraciones de Studio.');
    }
};
