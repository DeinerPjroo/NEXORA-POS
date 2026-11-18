<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('kind', 12)->default('regular');
            $table->string('combo_allocation_mode', 20)->nullable();
        });
        Schema::create('product_combo_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('component_product_id');
            $table->unsignedBigInteger('component_variant_id')->nullable();
            $table->unsignedTinyInteger('units')->default(1);
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->index(['tenant_id', 'product_id', 'is_active'], 'combo_components_active_index');
            $table->foreign(['tenant_id', 'product_id'], 'combo_components_root_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['tenant_id', 'component_product_id'], 'combo_components_product_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['tenant_id', 'component_product_id', 'component_variant_id'], 'combo_components_variant_fk')->references(['tenant_id', 'product_id', 'id'])->on('product_variants')->restrictOnDelete();
        });
        Schema::create('order_combos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('order_id');
            $table->unsignedBigInteger('product_id');
            $table->string('product_name', 150);
            $table->string('sku', 40);
            $table->unsignedInteger('quantity');
            $table->decimal('unit_price', 19, 4);
            $table->decimal('line_subtotal', 19, 4);
            $table->string('notes', 300)->nullable();
            $table->json('snapshot');
            $table->timestamps();
            $table->unique(['tenant_id', 'order_id', 'id'], 'order_combos_order_identity');
            $table->foreign(['tenant_id', 'order_id'], 'order_combos_order_fk')->references(['tenant_id', 'id'])->on('orders')->restrictOnDelete();
            $table->foreign(['tenant_id', 'product_id'], 'order_combos_product_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
        });
        Schema::table('order_items', function (Blueprint $table) {
            $table->unsignedBigInteger('order_combo_id')->nullable();
            $table->unsignedTinyInteger('combo_position')->nullable();
            $table->foreign(['tenant_id', 'order_id', 'order_combo_id'], 'order_items_combo_fk')->references(['tenant_id', 'order_id', 'id'])->on('order_combos')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('La composición y asignaciones históricas de combos no se eliminan automáticamente.');
    }
};
