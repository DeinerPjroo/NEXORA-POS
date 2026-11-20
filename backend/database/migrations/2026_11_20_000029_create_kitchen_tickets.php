<?php

use App\Domains\Identity\PermissionCatalog;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', fn (Blueprint $t) => $t->unique(['tenant_id', 'branch_id', 'id'], 'orders_kitchen_branch_identity'));
        Schema::table('order_items', fn (Blueprint $t) => $t->unique(['tenant_id', 'order_id', 'id'], 'order_item_kitchen_identity'));
        Schema::create('kitchen_routes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('product_id');
            $t->unsignedBigInteger('kitchen_station_id');
            $t->boolean('is_active')->default(true);
            $t->unsignedInteger('revision')->default(1);
            $t->timestamps();
            $t->unique(['tenant_id', 'branch_id', 'product_id'], 'kroute_product_branch');
            $t->foreign(['tenant_id', 'branch_id', 'kitchen_station_id'], 'kroute_station')->references(['tenant_id', 'branch_id', 'id'])->on('kitchen_stations')->restrictOnDelete();
            $t->foreign(['tenant_id', 'product_id'], 'kroute_product')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
        });
        Schema::create('kitchen_dispatches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('order_id');
            $t->unsignedBigInteger('created_by');
            $t->timestamps();
            $t->unique(['tenant_id', 'order_id', 'id'], 'kdispatch_identity');
            $t->foreign(['tenant_id', 'branch_id', 'order_id'], 'kdispatch_order')->references(['tenant_id', 'branch_id', 'id'])->on('orders')->restrictOnDelete();
            $t->foreign(['tenant_id', 'created_by'], 'kdispatch_actor')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        Schema::create('kitchen_tickets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('order_id');
            $t->unsignedBigInteger('kitchen_dispatch_id');
            $t->unsignedBigInteger('kitchen_station_id');
            $t->string('station_name', 80);
            $t->string('station_color', 7);
            $t->unsignedSmallInteger('target_minutes');
            $t->json('order_snapshot');
            $t->string('status', 20)->default('new');
            $t->unsignedInteger('revision')->default(1);
            $t->dateTime('started_at')->nullable();
            $t->dateTime('ready_at')->nullable();
            $t->dateTime('delivered_at')->nullable();
            $t->timestamps();
            $t->unique(['tenant_id', 'order_id', 'id'], 'kticket_identity');
            $t->index(['tenant_id', 'branch_id', 'status', 'id'], 'kticket_board');
            $t->foreign(['tenant_id', 'branch_id', 'kitchen_station_id'], 'kticket_station')->references(['tenant_id', 'branch_id', 'id'])->on('kitchen_stations')->restrictOnDelete();
            $t->foreign(['tenant_id', 'order_id', 'kitchen_dispatch_id'], 'kticket_dispatch')->references(['tenant_id', 'order_id', 'id'])->on('kitchen_dispatches')->restrictOnDelete();
            $t->foreign(['tenant_id', 'branch_id', 'order_id'], 'kticket_order_branch')->references(['tenant_id', 'branch_id', 'id'])->on('orders')->restrictOnDelete();
        });
        Schema::create('kitchen_ticket_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('order_id');
            $t->unsignedBigInteger('kitchen_ticket_id');
            $t->unsignedBigInteger('order_item_id');
            $t->json('snapshot');
            $t->timestamps();
            $t->unique(['tenant_id', 'order_item_id'], 'kline_sent_once');
            $t->foreign(['tenant_id', 'order_id', 'kitchen_ticket_id'], 'kline_ticket')->references(['tenant_id', 'order_id', 'id'])->on('kitchen_tickets')->restrictOnDelete();
            $t->foreign(['tenant_id', 'order_id', 'order_item_id'], 'kline_order_item')->references(['tenant_id', 'order_id', 'id'])->on('order_items')->restrictOnDelete();
        });
        Schema::create('kitchen_ticket_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('order_id');
            $t->unsignedBigInteger('kitchen_ticket_id');
            $t->unsignedBigInteger('actor_id');
            $t->string('from_status', 20)->nullable();
            $t->string('to_status', 20);
            $t->string('reason', 300)->nullable();
            $t->dateTime('created_at');
            $t->foreign(['tenant_id', 'order_id', 'kitchen_ticket_id'], 'kevent_ticket')->references(['tenant_id', 'order_id', 'id'])->on('kitchen_tickets')->restrictOnDelete();
            $t->foreign(['tenant_id', 'actor_id'], 'kevent_actor')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        if (DB::connection()->pretending()) {
            return;
        }
        [$name, $group] = PermissionCatalog::ALL['kitchen.operate'];
        DB::table('permissions')->updateOrInsert(['key' => 'kitchen.operate'], ['name' => $name, 'group' => $group]);
        $id = DB::table('permissions')->where('key', 'kitchen.operate')->value('id');
        DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(100, function ($roles) use ($id) {
            foreach ($roles as $role) {
                DB::table('role_permission')->insertOrIgnore(['tenant_id' => $role->tenant_id, 'role_id' => $role->id, 'permission_id' => $id]);
            }
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Se conserva el historial de comandas.');
    }
};
