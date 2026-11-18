<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_context_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->string('channel', 20);
            $table->decimal('amount', 19, 4);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->unsignedBigInteger('variant_scope')->storedAs('coalesce(variant_id, 0)');
            $table->unsignedBigInteger('branch_scope')->storedAs('coalesce(branch_id, 0)');
            $table->timestamps();
            $table->unique(['tenant_id', 'product_id', 'variant_scope', 'branch_scope', 'channel'], 'context_prices_scope_unique');
            $table->foreign(['tenant_id', 'product_id'], 'context_prices_product_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['tenant_id', 'product_id', 'variant_id'], 'context_prices_variant_fk')->references(['tenant_id', 'product_id', 'id'])->on('product_variants')->restrictOnDelete();
            $table->foreign(['tenant_id', 'branch_id'], 'context_prices_branch_fk')->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
        });
        Schema::table('order_items', fn (Blueprint $table) => $table->json('price_snapshot')->nullable());
    }

    public function down(): void
    {
        throw new RuntimeException('Las reglas de precio y sus snapshots históricos no se eliminan automáticamente.');
    }
};
