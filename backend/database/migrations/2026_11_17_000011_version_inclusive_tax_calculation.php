<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', fn (Blueprint $table) => $table->unsignedSmallInteger('calculation_version')->default(1));
    }

    public function down(): void
    {
        throw new RuntimeException('La versión del cálculo de ventas históricas no se elimina automáticamente.');
    }
};
