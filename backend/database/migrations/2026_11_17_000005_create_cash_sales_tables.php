<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', fn (Blueprint $table) => $table->unique(['tenant_id', 'branch_id', 'id'], 'orders_branch_identity'));
        Schema::table('cash_sessions', fn (Blueprint $table) => $table->unique(['tenant_id', 'branch_id', 'id'], 'sessions_branch_identity'));
        Schema::table('cash_movements', fn (Blueprint $table) => $table->unique(['tenant_id', 'cash_session_id', 'id'], 'movements_session_identity'));
        Schema::create('sales_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->unique()->constrained()->restrictOnDelete();
            $table->boolean('configured')->default(false);
            $table->string('tax_mode', 20)->default('none');
            $table->string('tax_name', 40)->default('Impuesto adicional');
            $table->decimal('tax_rate', 7, 4)->default(0);
            $table->unsignedInteger('revision')->default(1);
            $table->unsignedBigInteger('next_receipt_number')->default(1);
            $table->timestamps();
        });
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('branch_id');
            $table->unsignedBigInteger('order_id');
            $table->unsignedBigInteger('created_by');
            $table->unsignedBigInteger('receipt_number');
            $table->string('status', 20)->default('paid');
            $table->string('currency', 3);
            $table->string('business_name', 120);
            $table->string('branch_name', 120);
            $table->string('branch_address', 255)->nullable();
            $table->string('tax_mode', 20);
            $table->string('tax_name', 40);
            $table->decimal('tax_rate', 7, 4);
            foreach (['catalog_subtotal', 'subtotal', 'discount_amount', 'taxable_base', 'tax_amount', 'total'] as $name) {
                $table->decimal($name, 19, 4);
            }
            $table->decimal('rounding_adjustment', 19, 4);
            $table->string('discount_reason', 200)->nullable();
            $table->unsignedInteger('settings_revision');
            $table->timestamps();
            $table->unique(['tenant_id', 'id']);
            $table->unique(['tenant_id', 'branch_id', 'id'], 'sales_branch_identity');
            $table->unique(['tenant_id', 'order_id']);
            $table->unique(['tenant_id', 'receipt_number']);
            $table->index(['tenant_id', 'branch_id', 'created_at']);
            $table->foreign(['tenant_id', 'branch_id', 'order_id'], 'sales_order_branch_fk')->references(['tenant_id', 'branch_id', 'id'])->on('orders')->restrictOnDelete();
            $table->foreign(['tenant_id', 'created_by'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        foreach (['payments', 'sale_refunds'] as $name) {
            Schema::create($name, function (Blueprint $table) use ($name) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
                $table->unsignedBigInteger('branch_id');
                $table->unsignedBigInteger('sale_id');
                $table->unsignedBigInteger('cash_session_id');
                $table->unsignedBigInteger('cash_movement_id');
                $table->unsignedBigInteger('actor_id');
                $table->decimal('amount', 19, 4);
                if ($name === 'payments') {
                    $table->string('method', 20)->default('cash');
                    $table->decimal('received_amount', 19, 4);
                    $table->decimal('change_amount', 19, 4);
                } else {
                    $table->string('reason', 300);
                }
                $table->timestamp('created_at');
                $table->unique(['tenant_id', 'sale_id']);
                $table->unique(['tenant_id', 'cash_movement_id']);
                $table->foreign(['tenant_id', 'branch_id', 'sale_id'], $name.'_sale_fk')->references(['tenant_id', 'branch_id', 'id'])->on('sales')->restrictOnDelete();
                $table->foreign(['tenant_id', 'branch_id', 'cash_session_id'], $name.'_session_fk')->references(['tenant_id', 'branch_id', 'id'])->on('cash_sessions')->restrictOnDelete();
                $table->foreign(['tenant_id', 'cash_session_id', 'cash_movement_id'], $name.'_movement_fk')->references(['tenant_id', 'cash_session_id', 'id'])->on('cash_movements')->restrictOnDelete();
                $table->foreign(['tenant_id', 'actor_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
            });
        }
        if (DB::connection()->pretending()) {
            return;
        }
        DB::table('tenants')->orderBy('id')->chunkById(200, function ($tenants) {
            foreach ($tenants as $tenant) {
                DB::table('sales_settings')->insert(['tenant_id' => $tenant->id, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
        foreach ([
            'sales.view' => 'Consultar ventas y recibos', 'sales.collect' => 'Cobrar pedidos en efectivo',
            'sales.configure' => 'Configurar cálculo de ventas', 'sales.discount' => 'Aplicar descuentos',
            'sales.refund' => 'Registrar devolución total',
        ] as $key => $label) {
            DB::table('permissions')->updateOrInsert(['key' => $key], ['name' => $label, 'group' => 'Ventas']);
            $id = DB::table('permissions')->where('key', $key)->value('id');
            DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(200, function ($roles) use ($id) {
                foreach ($roles as $role) {
                    DB::table('role_permission')->insertOrIgnore(['tenant_id' => $role->tenant_id, 'role_id' => $role->id, 'permission_id' => $id]);
                }
            });
        }
    }

    public function down(): void
    {
        foreach (['sale_refunds', 'payments', 'sales', 'sales_settings'] as $name) {
            Schema::dropIfExists($name);
        }
        Schema::table('cash_movements', fn (Blueprint $table) => $table->dropUnique('movements_session_identity'));
        Schema::table('cash_sessions', fn (Blueprint $table) => $table->dropUnique('sessions_branch_identity'));
        Schema::table('orders', fn (Blueprint $table) => $table->dropUnique('orders_branch_identity'));
        $ids = DB::table('permissions')->whereIn('key', ['sales.view', 'sales.collect', 'sales.configure', 'sales.discount', 'sales.refund'])->pluck('id');
        DB::table('role_permission')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
