<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', fn (Blueprint $table) => $table->boolean('availability_schedule_enabled')->default(false));
        Schema::create('product_availability_windows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('name', 80);
            $table->unsignedTinyInteger('weekday');
            $table->string('start_time', 5);
            $table->string('end_time', 5);
            $table->boolean('ends_next_day')->default(false);
            $table->date('valid_from')->nullable();
            $table->date('valid_until')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->foreign(['tenant_id', 'product_id'], 'availability_windows_product_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
            $table->index(['tenant_id', 'product_id', 'is_active'], 'availability_windows_active_index');
        });
        Schema::table('order_items', fn (Blueprint $table) => $table->json('availability_snapshot')->nullable());
    }

    public function down(): void
    {
        throw new RuntimeException('Los horarios y sus snapshots históricos no se eliminan automáticamente.');
    }
};
