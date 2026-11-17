<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_methods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->string('code', 20);
            $table->string('name', 60);
            $table->string('kind', 20);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'code']);
            $table->unique(['tenant_id', 'name']);
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->unsignedBigInteger('payment_method_id')->nullable();
            $table->string('method_name', 60)->default('Efectivo');
            $table->string('method_kind', 20)->default('cash');
            $table->unsignedInteger('method_revision')->nullable();
            $table->string('provenance', 20)->default('operator');
            $table->string('reference', 120)->nullable();
            $table->foreign(['tenant_id', 'payment_method_id'], 'payments_method_fk')->references(['tenant_id', 'id'])->on('payment_methods')->restrictOnDelete();
        });
        foreach (['payments', 'sale_refunds'] as $name) {
            Schema::table($name, function (Blueprint $table) use ($name) {
                $command = $table->dropForeign(['tenant_id', 'cash_session_id', 'cash_movement_id']);
                $command->index = $name.'_movement_fk';
            });
            Schema::table($name, fn (Blueprint $table) => $table->unsignedBigInteger('cash_movement_id')->nullable()->change());
            Schema::table($name, function (Blueprint $table) use ($name) {
                $table->foreign(['tenant_id', 'cash_session_id', 'cash_movement_id'], $name.'_movement_fk')->references(['tenant_id', 'cash_session_id', 'id'])->on('cash_movements')->restrictOnDelete();
            });
        }
        Schema::table('sale_refunds', fn (Blueprint $table) => $table->string('reference', 120)->nullable());
        if (DB::connection()->pretending()) {
            return;
        }
        DB::table('tenants')->orderBy('id')->chunkById(200, function ($tenants) {
            foreach ($tenants as $tenant) {
                $id = DB::table('payment_methods')->insertGetId(['tenant_id' => $tenant->id, 'code' => 'cash', 'name' => 'Efectivo', 'kind' => 'cash', 'is_active' => true, 'is_system' => true, 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('payments')->where('tenant_id', $tenant->id)->update(['payment_method_id' => $id, 'method_revision' => 1]);
            }
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Migración financiera no reversible automáticamente: conservar pagos y métodos históricos.');
    }
};
