<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->string('name', 100);
            $table->string('description', 500)->nullable();
            $table->string('color', 7)->default('#8271FF');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'name']);
        });
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('category_id');
            $table->string('name', 150);
            $table->string('sku', 40);
            $table->string('barcode', 64)->nullable();
            $table->text('description')->nullable();
            $table->decimal('sale_price', 19, 4);
            $table->decimal('cost_price', 19, 4)->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_available')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'sku']);
            $table->unique(['tenant_id', 'barcode']);
            $table->index(['tenant_id', 'category_id', 'is_active']);
            $table->index(['tenant_id', 'name']);
            $table->foreign(['tenant_id', 'category_id'])->references(['tenant_id', 'id'])->on('categories')->restrictOnDelete();
        });

        // El exportador de estructura ejecuta las migraciones en modo pretend, sin datos.
        if (DB::connection()->pretending()) {
            return;
        }
        $permissions = [
            'catalog.view' => 'Consultar catálogo',
            'catalog.manage' => 'Administrar catálogo',
            'catalog.costs' => 'Consultar y editar costos del catálogo',
        ];
        foreach ($permissions as $key => $name) {
            DB::table('permissions')->updateOrInsert(['key' => $key], ['name' => $name, 'group' => 'Catálogo']);
            $permissionId = DB::table('permissions')->where('key', $key)->value('id');
            // Migración de permisos: solo el propietario recibe nuevas capacidades automáticamente.
            DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(200, function ($roles) use ($permissionId) {
                foreach ($roles as $role) {
                    DB::table('role_permission')->insertOrIgnore(['tenant_id' => $role->tenant_id, 'role_id' => $role->id, 'permission_id' => $permissionId]);
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
        Schema::dropIfExists('categories');
        $keys = ['catalog.view', 'catalog.manage', 'catalog.costs'];
        $ids = DB::table('permissions')->whereIn('key', $keys)->pluck('id');
        DB::table('role_permission')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('key', $keys)->delete();
    }
};
