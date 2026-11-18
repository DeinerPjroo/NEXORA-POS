<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_modifier_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('name', 80);
            $table->string('kind', 20);
            $table->unsignedTinyInteger('min_select');
            $table->unsignedTinyInteger('max_select');
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'product_id', 'id'], 'modifier_groups_product_identity');
            $table->unique(['tenant_id', 'product_id', 'name'], 'modifier_groups_product_name');
            $table->index(['tenant_id', 'product_id', 'is_active', 'position'], 'modifier_groups_menu_idx');
            $table->foreign(['tenant_id', 'product_id'], 'modifier_groups_product_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
        });
        Schema::create('product_modifier_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('modifier_group_id');
            $table->string('name', 80);
            $table->decimal('extra_price', 19, 4);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
            $table->unique(['tenant_id', 'modifier_group_id', 'name'], 'modifier_options_group_name');
            $table->index(['tenant_id', 'modifier_group_id', 'is_active', 'position'], 'modifier_options_menu_idx');
            $table->foreign(['tenant_id', 'product_id', 'modifier_group_id'], 'modifier_options_group_fk')->references(['tenant_id', 'product_id', 'id'])->on('product_modifier_groups')->restrictOnDelete();
        });
        Schema::table('order_items', function (Blueprint $table) {
            $table->decimal('base_unit_price', 19, 4)->nullable();
            $table->json('modifiers_snapshot')->nullable();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Los modificadores y snapshots históricos del pedido no se eliminan automáticamente.');
    }
};
