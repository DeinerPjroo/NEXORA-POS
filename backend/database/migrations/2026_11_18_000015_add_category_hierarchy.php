<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->foreign(['tenant_id', 'parent_id'], 'categories_parent_fk')->references(['tenant_id', 'id'])->on('categories')->restrictOnDelete();
            $table->index(['tenant_id', 'parent_id', 'name']);
        });
    }

    public function down(): void
    {
        throw new RuntimeException('La organización del catálogo no se elimina automáticamente.');
    }
};
