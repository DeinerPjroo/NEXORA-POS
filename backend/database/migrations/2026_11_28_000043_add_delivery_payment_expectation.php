<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_deliveries', function (Blueprint $t) {
            $t->unsignedBigInteger('expected_payment_method_id')->nullable();
            $t->json('payment_expectation')->nullable();
            $t->foreign(['tenant_id', 'expected_payment_method_id'], 'delivery_expected_method_fk')->references(['tenant_id', 'id'])->on('payment_methods')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('order_deliveries', function (Blueprint $t) {
            $t->dropForeign('delivery_expected_method_fk');
            $t->dropColumn(['expected_payment_method_id', 'payment_expectation']);
        });
    }
};
