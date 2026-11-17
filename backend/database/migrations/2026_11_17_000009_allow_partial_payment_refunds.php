<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_refunds', fn (Blueprint $table) => $table->index(['tenant_id', 'payment_id'], 'refunds_payment_lookup'));
        Schema::table('sale_refunds', fn (Blueprint $table) => $table->dropUnique('sale_refunds_tenant_id_payment_id_unique'));
    }

    public function down(): void
    {
        throw new RuntimeException('No se pueden compactar devoluciones parciales históricas mediante rollback automático.');
    }
};
