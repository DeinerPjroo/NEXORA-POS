<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_registers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('branch_id');
            $table->string('name', 80);
            $table->string('code', 20);
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('active_session_id')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'branch_id', 'id']);
            $table->unique(['tenant_id', 'branch_id', 'code']);
            $table->foreign(['tenant_id', 'branch_id'])->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
        });
        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('branch_id');
            $table->unsignedBigInteger('cash_register_id');
            $table->unsignedBigInteger('opened_by');
            $table->unsignedBigInteger('closed_by')->nullable();
            $table->string('currency', 3);
            $table->string('status', 20)->default('open');
            $table->decimal('opening_amount', 19, 4);
            $table->decimal('expected_amount', 19, 4);
            $table->decimal('counted_amount', 19, 4)->nullable();
            $table->decimal('difference', 19, 4)->nullable();
            $table->string('closing_note', 500)->nullable();
            $table->unsignedInteger('revision')->default(1);
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'cash_register_id', 'id'], 'cash_sessions_register_identity');
            $table->index(['tenant_id', 'branch_id', 'status']);
            $table->foreign(['tenant_id', 'branch_id', 'cash_register_id'], 'cash_sessions_branch_register_fk')->references(['tenant_id', 'branch_id', 'id'])->on('cash_registers')->restrictOnDelete();
            $table->foreign(['tenant_id', 'opened_by'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
            $table->foreign(['tenant_id', 'closed_by'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        Schema::table('cash_registers', function (Blueprint $table) {
            $table->foreign(['tenant_id', 'id', 'active_session_id'], 'cash_register_active_session_fk')->references(['tenant_id', 'cash_register_id', 'id'])->on('cash_sessions')->restrictOnDelete();
        });
        Schema::create('cash_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('cash_session_id');
            $table->unsignedBigInteger('actor_id');
            $table->string('type', 20);
            $table->decimal('amount', 19, 4);
            $table->string('reason', 300);
            $table->timestamp('created_at');
            $table->unique(['tenant_id', 'id']);
            $table->foreign(['tenant_id', 'cash_session_id'])->references(['tenant_id', 'id'])->on('cash_sessions')->restrictOnDelete();
            $table->foreign(['tenant_id', 'actor_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
            $table->index(['tenant_id', 'cash_session_id', 'id']);
        });
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->uuid('public_id')->unique();
            $table->unsignedBigInteger('branch_id');
            $table->unsignedBigInteger('created_by');
            $table->string('channel', 20);
            $table->string('reference', 80)->nullable();
            $table->string('customer_name', 100)->nullable();
            $table->text('notes')->nullable();
            $table->string('currency', 3);
            $table->decimal('subtotal', 19, 4);
            $table->string('status', 20)->default('open');
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->index(['tenant_id', 'branch_id', 'status', 'id']);
            $table->foreign(['tenant_id', 'branch_id'])->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
            $table->foreign(['tenant_id', 'created_by'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('order_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->string('product_name', 150);
            $table->string('variant_name', 80)->nullable();
            $table->string('sku', 40);
            $table->unsignedInteger('quantity');
            $table->decimal('unit_price', 19, 4);
            $table->decimal('line_subtotal', 19, 4);
            $table->string('notes', 300)->nullable();
            $table->timestamps();
            $table->foreign(['tenant_id', 'order_id'])->references(['tenant_id', 'id'])->on('orders')->restrictOnDelete();
            $table->foreign(['tenant_id', 'product_id'])->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['tenant_id', 'variant_id'])->references(['tenant_id', 'id'])->on('product_variants')->restrictOnDelete();
        });
        Schema::create('order_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('order_id');
            $table->unsignedBigInteger('actor_id');
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->string('reason', 300)->nullable();
            $table->timestamp('created_at');
            $table->foreign(['tenant_id', 'order_id'])->references(['tenant_id', 'id'])->on('orders')->restrictOnDelete();
            $table->foreign(['tenant_id', 'actor_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        Schema::create('idempotency_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->uuid('key');
            $table->unsignedBigInteger('actor_id');
            $table->string('action', 60);
            $table->char('request_hash', 64);
            $table->string('resource_type', 100);
            $table->unsignedBigInteger('resource_id');
            $table->timestamp('created_at');
            $table->unique(['tenant_id', 'key']);
            $table->foreign(['tenant_id', 'actor_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        if (DB::connection()->pretending()) return;
        DB::table('branches')->orderBy('id')->chunkById(200, function ($branches) {
            foreach ($branches as $branch) {
                DB::table('cash_registers')->insert(['tenant_id' => $branch->tenant_id, 'branch_id' => $branch->id, 'name' => 'Caja principal', 'code' => 'PRINCIPAL', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
        foreach ([
            'cash.view' => ['Consultar caja', 'Caja'], 'cash.manage' => ['Administrar y abrir/cerrar caja', 'Caja'],
            'cash.movements' => ['Registrar movimientos manuales', 'Caja'], 'orders.view' => ['Consultar pedidos', 'Pedidos'],
            'orders.manage' => ['Crear y preparar pedidos', 'Pedidos'], 'orders.cancel' => ['Cancelar pedidos', 'Pedidos'],
        ] as $key => [$name, $group]) {
            DB::table('permissions')->updateOrInsert(['key' => $key], ['name' => $name, 'group' => $group]);
            $permissionId = DB::table('permissions')->where('key', $key)->value('id');
            DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(200, function ($roles) use ($permissionId) {
                foreach ($roles as $role) DB::table('role_permission')->insertOrIgnore(['tenant_id' => $role->tenant_id, 'role_id' => $role->id, 'permission_id' => $permissionId]);
            });
        }
    }

    public function down(): void
    {
        foreach (['idempotency_records', 'order_events', 'order_items', 'orders', 'cash_movements'] as $name) Schema::dropIfExists($name);
        Schema::table('cash_registers', fn (Blueprint $table) => $table->dropForeign('cash_register_active_session_fk'));
        Schema::dropIfExists('cash_sessions');
        Schema::dropIfExists('cash_registers');
        $ids = DB::table('permissions')->whereIn('key', ['cash.view', 'cash.manage', 'cash.movements', 'orders.view', 'orders.manage', 'orders.cancel'])->pluck('id');
        DB::table('role_permission')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
