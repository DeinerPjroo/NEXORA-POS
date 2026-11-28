<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $t) {
            $t->dropForeign(['tenant_id', 'branch_id', 'cash_session_id'])->index = 'payments_session_fk';
            $t->dropForeign(['tenant_id', 'cash_session_id', 'cash_movement_id'])->index = 'payments_movement_fk';
        });
        Schema::table('payments', fn (Blueprint $t) => $t->unsignedBigInteger('cash_session_id')->nullable()->change());
        Schema::table('payments', function (Blueprint $t) {
            $t->foreign(['tenant_id', 'branch_id', 'cash_session_id'], 'payments_session_fk')->references(['tenant_id', 'branch_id', 'id'])->on('cash_sessions')->restrictOnDelete();
            $t->foreign(['tenant_id', 'cash_session_id', 'cash_movement_id'], 'payments_movement_fk')->references(['tenant_id', 'cash_session_id', 'id'])->on('cash_movements')->restrictOnDelete();
        });
        Schema::table('sales', fn (Blueprint $t) => $t->unique(['tenant_id', 'order_id', 'id'], 'sales_collection_order_identity'));
        Schema::create('courier_collections', function (Blueprint $t) {
            $t->id();
            foreach (['tenant_id', 'branch_id', 'order_id', 'order_delivery_id', 'sale_id', 'payment_id', 'courier_id'] as $key) {
                $t->unsignedBigInteger($key);
            }
            $t->boolean('confirmed_received');
            $t->string('reason', 250);
            $t->timestamp('created_at');
            $t->unique(['tenant_id', 'payment_id'], 'courier_collection_payment_unique');
            $t->unique(['tenant_id', 'branch_id', 'id'], 'courier_collection_branch_identity');
            $t->foreign(['tenant_id', 'branch_id', 'sale_id'], 'courier_collection_sale_branch_fk')->references(['tenant_id', 'branch_id', 'id'])->on('sales')->restrictOnDelete();
            $t->foreign(['tenant_id', 'order_id', 'sale_id'], 'courier_collection_sale_order_fk')->references(['tenant_id', 'order_id', 'id'])->on('sales')->restrictOnDelete();
            $t->foreign(['tenant_id', 'sale_id', 'payment_id'], 'courier_collection_payment_fk')->references(['tenant_id', 'sale_id', 'id'])->on('payments')->restrictOnDelete();
            $t->foreign(['tenant_id', 'order_id', 'order_delivery_id'], 'courier_collection_delivery_fk')->references(['tenant_id', 'order_id', 'id'])->on('order_deliveries')->restrictOnDelete();
            $t->foreign(['tenant_id', 'courier_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        Schema::create('courier_settlements', function (Blueprint $t) {
            $t->id();
            foreach (['tenant_id', 'branch_id', 'courier_collection_id', 'cash_session_id', 'cash_movement_id', 'actor_id'] as $key) {
                $t->unsignedBigInteger($key);
            }
            $t->decimal('amount', 19, 4);
            $t->string('reason', 250);
            $t->boolean('confirmed_handover');
            $t->timestamp('created_at');
            $t->unique(['tenant_id', 'cash_movement_id'], 'courier_settlement_movement_unique');
            $t->foreign(['tenant_id', 'branch_id', 'courier_collection_id'], 'courier_settlement_collection_fk')->references(['tenant_id', 'branch_id', 'id'])->on('courier_collections')->restrictOnDelete();
            $t->foreign(['tenant_id', 'branch_id', 'cash_session_id'], 'courier_settlement_session_fk')->references(['tenant_id', 'branch_id', 'id'])->on('cash_sessions')->restrictOnDelete();
            $t->foreign(['tenant_id', 'cash_session_id', 'cash_movement_id'], 'courier_settlement_movement_fk')->references(['tenant_id', 'cash_session_id', 'id'])->on('cash_movements')->restrictOnDelete();
            $t->foreign(['tenant_id', 'actor_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        // Historical cash destinations cannot be reconstructed by making old columns required.
        throw new LogicException('La custodia conserva historia financiera; usa una migración compensatoria.');
    }
};
