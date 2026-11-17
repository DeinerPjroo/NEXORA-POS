<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->string('name', 60);
            $table->string('price_mode', 20);
            $table->json('rates');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'name']);
        });
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedBigInteger('tax_profile_id')->nullable();
            $table->foreign(['tenant_id', 'tax_profile_id'], 'products_tax_profile_fk')->references(['tenant_id', 'id'])->on('tax_profiles')->restrictOnDelete();
        });
        Schema::table('order_items', fn (Blueprint $table) => $table->json('tax_snapshot')->nullable());
        Schema::table('sales_settings', fn (Blueprint $table) => $table->json('tip_tax_snapshot')->nullable());
        Schema::table('sales', fn (Blueprint $table) => $table->json('tax_breakdown')->nullable());
    }

    public function down(): void
    {
        throw new RuntimeException('Los perfiles y snapshots de impuestos históricos no se eliminan automáticamente.');
    }
};
