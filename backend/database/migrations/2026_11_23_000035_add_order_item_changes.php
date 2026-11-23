<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_item_changes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('order_id');
            $t->unsignedBigInteger('order_item_id');
            $t->unsignedBigInteger('replacement_item_id')->nullable();
            $t->unsignedBigInteger('actor_id');
            $t->string('reason', 300);
            $t->timestamp('created_at');
            $t->unique(['tenant_id', 'order_item_id'], 'ochange_original_once');
            $t->index(['tenant_id', 'created_at'], 'ochange_recent');
            $t->foreign(['tenant_id', 'order_id', 'order_item_id'], 'ochange_original_fk')->references(['tenant_id', 'order_id', 'id'])->on('order_items')->restrictOnDelete();
            $t->foreign(['tenant_id', 'order_id', 'replacement_item_id'], 'ochange_replacement_fk')->references(['tenant_id', 'order_id', 'id'])->on('order_items')->restrictOnDelete();
            $t->foreign(['tenant_id', 'actor_id'], 'ochange_actor_fk')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar historia de correcciones de pedidos.');
    }
};
