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
        Schema::create('dining_rooms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('branch_id');
            $table->string('name', 80);
            $table->string('color', 7)->default('#F5F7FB');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->unsignedTinyInteger('layout_schema_version')->default(1);
            $table->json('objects')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'branch_id', 'id'], 'dining_rooms_branch_identity');
            $table->unique(['tenant_id', 'branch_id', 'name'], 'dining_rooms_name_unique');
            $table->foreign(['tenant_id', 'branch_id'], 'dining_rooms_branch_fk')->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
        });
        Schema::create('dining_tables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('branch_id');
            $table->unsignedBigInteger('dining_room_id');
            $table->string('name', 50);
            $table->string('shape', 12);
            $table->string('color', 7);
            $table->unsignedTinyInteger('capacity');
            $table->unsignedSmallInteger('x');
            $table->unsignedSmallInteger('y');
            $table->unsignedSmallInteger('width');
            $table->unsignedSmallInteger('height');
            $table->unsignedSmallInteger('rotation')->default(0);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'branch_id', 'id'], 'dining_tables_branch_identity');
            $table->unique(['tenant_id', 'dining_room_id', 'name'], 'dining_tables_name_unique');
            $table->foreign(['tenant_id', 'branch_id', 'dining_room_id'], 'dining_tables_room_fk')->references(['tenant_id', 'branch_id', 'id'])->on('dining_rooms')->restrictOnDelete();
        });
        if (DB::connection()->pretending()) {
            return;
        }
        foreach (['dining.view', 'dining.manage'] as $key) {
            [$name, $group] = PermissionCatalog::ALL[$key];
            DB::table('permissions')->updateOrInsert(['key' => $key], ['name' => $name, 'group' => $group]);
            $id = DB::table('permissions')->where('key', $key)->value('id');
            DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(100, function ($roles) use ($id) {
                foreach ($roles as $role) {
                    DB::table('role_permission')->insertOrIgnore(['tenant_id' => $role->tenant_id, 'role_id' => $role->id, 'permission_id' => $id]);
                }
            });
        }
    }

    public function down(): void
    {
        throw new RuntimeException('Los salones y referencias de mesas se conservan.');
    }
};
