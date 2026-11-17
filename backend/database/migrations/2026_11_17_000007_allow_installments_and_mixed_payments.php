<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', fn (Blueprint $table) => $table->unsignedInteger('revision')->default(1));
        Schema::table('payments', function (Blueprint $table) {
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'sale_id', 'id'], 'payments_sale_identity');
        });
        Schema::table('sale_refunds', fn (Blueprint $table) => $table->unsignedBigInteger('payment_id')->nullable());
        if (! DB::connection()->pretending()) {
            DB::table('sale_refunds')->orderBy('id')->chunkById(200, function ($refunds) {
                foreach ($refunds as $refund) {
                    $paymentId = DB::table('payments')->where('tenant_id', $refund->tenant_id)->where('sale_id', $refund->sale_id)->value('id');
                    if (! $paymentId) {
                        throw new RuntimeException('No se puede enlazar una devolución histórica sin pago original.');
                    }
                    DB::table('sale_refunds')->where('id', $refund->id)->update(['payment_id' => $paymentId]);
                }
            });
        }
        Schema::table('sale_refunds', function (Blueprint $table) {
            $table->unsignedBigInteger('payment_id')->nullable(false)->change();
            $table->unique(['tenant_id', 'payment_id']);
            $table->foreign(['tenant_id', 'sale_id', 'payment_id'], 'refunds_original_payment_fk')->references(['tenant_id', 'sale_id', 'id'])->on('payments')->restrictOnDelete();
        });
        // Índices de FK explícitos antes de retirar las unicidades originales.
        Schema::table('payments', fn (Blueprint $table) => $table->index(['tenant_id', 'sale_id'], 'payments_sale_lookup'));
        Schema::table('sale_refunds', fn (Blueprint $table) => $table->index(['tenant_id', 'sale_id'], 'refunds_sale_lookup'));
        Schema::table('payments', fn (Blueprint $table) => $table->dropUnique('payments_tenant_id_sale_id_unique'));
        Schema::table('sale_refunds', fn (Blueprint $table) => $table->dropUnique('sale_refunds_tenant_id_sale_id_unique'));
    }

    public function down(): void
    {
        throw new RuntimeException('No se pueden compactar pagos o devoluciones históricos mediante rollback automático.');
    }
};
