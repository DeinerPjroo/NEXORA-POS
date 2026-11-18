<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_combo_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('name', 80);
            $table->unsignedTinyInteger('min_select')->default(0);
            $table->unsignedTinyInteger('max_select')->default(1);
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'product_id', 'id'], 'combo_groups_root_identity');
            $table->foreign(['tenant_id', 'product_id'], 'combo_groups_product_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
        });
        Schema::table('product_combo_components', function (Blueprint $table) {
            $table->unsignedBigInteger('combo_group_id')->nullable();
            $table->foreign(['tenant_id', 'product_id', 'combo_group_id'], 'combo_components_group_fk')->references(['tenant_id', 'product_id', 'id'])->on('product_combo_groups')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Los grupos y selecciones históricas de combos no se eliminan automáticamente.');
    }
};
