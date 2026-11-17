<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('sale_id');
            $table->unsignedTinyInteger('number');
            $table->string('label', 40);
            $table->decimal('amount', 19, 4);
            $table->timestamp('created_at');
            $table->unique(['tenant_id', 'sale_id', 'id'], 'accounts_sale_identity');
            $table->unique(['tenant_id', 'sale_id', 'number'], 'accounts_sale_number');
            $table->foreign(['tenant_id', 'sale_id'], 'accounts_sale_fk')->references(['tenant_id', 'id'])->on('sales')->restrictOnDelete();
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->unsignedBigInteger('account_id')->nullable();
            $table->foreign(['tenant_id', 'sale_id', 'account_id'], 'payments_account_fk')->references(['tenant_id', 'sale_id', 'id'])->on('sale_accounts')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('No se pueden eliminar asignaciones históricas de cuentas mediante rollback automático.');
    }
};
