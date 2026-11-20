<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $export = DB::connection()->pretending();
        if ($export || ! Schema::hasColumn('order_items', 'preparation_destination')) {
            Schema::table('order_items', fn (Blueprint $t) => $t->string('preparation_destination', 16)->nullable());
        }
        if ($export || ! Schema::hasTable('preparation_corrections')) {
            Schema::create('preparation_corrections', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('tenant_id');
                $t->unsignedBigInteger('order_id');
                $t->unsignedBigInteger('order_item_id');
                $t->unsignedBigInteger('actor_id');
                $t->string('from_destination', 16);
                $t->string('to_destination', 16);
                $t->string('reason', 300);
                $t->timestamp('created_at');
                $t->foreign(['tenant_id', 'order_id', 'order_item_id'], 'preparation_item_fk')->references(['tenant_id', 'order_id', 'id'])->on('order_items')->restrictOnDelete();
                $t->foreign(['tenant_id', 'actor_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        throw new LogicException('Conservar historia de preparación.');
    }
};
