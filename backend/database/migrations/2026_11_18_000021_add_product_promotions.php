<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->string('channel', 20);
            $table->string('name', 80);
            $table->string('discount_type', 12);
            $table->decimal('discount_value', 19, 4);
            $table->unsignedSmallInteger('priority')->default(0);
            $table->string('valid_from', 10)->nullable();
            $table->string('valid_until', 10)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->index(['tenant_id', 'product_id', 'is_active'], 'promotions_active_product');
            $table->foreign(['tenant_id', 'product_id'], 'promotions_product_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['tenant_id', 'product_id', 'variant_id'], 'promotions_variant_fk')->references(['tenant_id', 'product_id', 'id'])->on('product_variants')->restrictOnDelete();
            $table->foreign(['tenant_id', 'branch_id'], 'promotions_branch_fk')->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Las promociones y sus referencias históricas se conservan.');
    }
};
