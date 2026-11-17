<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('image_path')->nullable();
            $table->string('image_mime', 30)->nullable();
        });
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('name', 80);
            $table->string('sku', 40);
            $table->string('barcode', 64)->nullable();
            $table->decimal('sale_price', 19, 4);
            $table->decimal('cost_price', 19, 4)->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_available')->default(true);
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'sku']);
            $table->unique(['tenant_id', 'barcode']);
            $table->unique(['tenant_id', 'product_id', 'name']);
            $table->index(['tenant_id', 'product_id', 'is_active']);
            $table->foreign(['tenant_id', 'product_id'])->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variants');
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn(['image_path', 'image_mime']));
    }
};
