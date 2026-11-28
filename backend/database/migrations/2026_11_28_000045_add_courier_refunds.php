<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_refunds', function (Blueprint $t) {
            $t->dropForeign(['tenant_id', 'branch_id', 'cash_session_id'])->index = 'sale_refunds_session_fk';
            $t->dropForeign(['tenant_id', 'cash_session_id', 'cash_movement_id'])->index = 'sale_refunds_movement_fk';
        });
        Schema::table('sale_refunds', fn (Blueprint $t) => $t->unsignedBigInteger('cash_session_id')->nullable()->change());
        Schema::table('courier_collections', fn (Blueprint $t) => $t->unique(['tenant_id', 'sale_id', 'payment_id', 'id'], 'courier_collection_refund_identity'));
        Schema::table('sale_refunds', function (Blueprint $t) {
            $t->unsignedBigInteger('courier_collection_id')->nullable();
            $t->boolean('confirmed_courier_handover')->nullable();
            $t->foreign(['tenant_id', 'branch_id', 'cash_session_id'], 'sale_refunds_session_fk')->references(['tenant_id', 'branch_id', 'id'])->on('cash_sessions')->restrictOnDelete();
            $t->foreign(['tenant_id', 'cash_session_id', 'cash_movement_id'], 'sale_refunds_movement_fk')->references(['tenant_id', 'cash_session_id', 'id'])->on('cash_movements')->restrictOnDelete();
            $t->foreign(['tenant_id', 'sale_id', 'payment_id', 'courier_collection_id'], 'refund_courier_collection_fk')->references(['tenant_id', 'sale_id', 'payment_id', 'id'])->on('courier_collections')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar devoluciones historicas; usar migracion compensatoria.');
    }
};
