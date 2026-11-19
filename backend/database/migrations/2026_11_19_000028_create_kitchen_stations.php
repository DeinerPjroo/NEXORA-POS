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
        Schema::create('kitchen_stations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('branch_id');
            $table->string('name', 80);
            $table->string('color', 7);
            $table->unsignedSmallInteger('target_minutes');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'branch_id', 'id'], 'kitchen_station_identity');
            $table->unique(['tenant_id', 'branch_id', 'name'], 'kitchen_station_name');
            $table->foreign(['tenant_id', 'branch_id'], 'kitchen_station_branch')->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
        });
        if (DB::connection()->pretending()) {
            return;
        }
        foreach (['kitchen.view', 'kitchen.manage'] as $key) {
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
        throw new RuntimeException('Se conserva la configuración histórica de cocina.');
    }
};
