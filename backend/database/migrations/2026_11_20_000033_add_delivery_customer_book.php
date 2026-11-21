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
        $export = DB::connection()->pretending();
        if ($export || ! Schema::hasTable('customers')) {
            Schema::create('customers', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('tenant_id');
                $t->unsignedBigInteger('branch_id');
                $t->string('name', 100);
                $t->string('phone', 30);
                $t->string('phone_digits', 30);
                $t->boolean('is_active')->default(true);
                $t->unsignedInteger('revision')->default(1);
                $t->timestamps();
                $t->unique(['tenant_id', 'branch_id', 'id'], 'customer_branch_identity');
                $t->index(['tenant_id', 'branch_id', 'phone_digits']);
                $t->foreign(['tenant_id', 'branch_id'])->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
            });
        }
        if ($export || ! Schema::hasTable('customer_addresses')) {
            Schema::create('customer_addresses', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('tenant_id');
                $t->unsignedBigInteger('branch_id');
                $t->unsignedBigInteger('customer_id');
                $t->string('label', 60);
                $t->string('recipient_name', 100);
                $t->string('phone', 30);
                $t->string('address', 300);
                $t->string('neighborhood', 100)->nullable();
                $t->string('location_reference', 300)->nullable();
                $t->string('instructions', 300)->nullable();
                $t->boolean('is_active')->default(true);
                $t->unsignedInteger('revision')->default(1);
                $t->timestamps();
                $t->unique(['tenant_id', 'branch_id', 'customer_id', 'id'], 'address_customer_identity');
                $t->foreign(['tenant_id', 'branch_id', 'customer_id'], 'address_customer_fk')->references(['tenant_id', 'branch_id', 'id'])->on('customers')->restrictOnDelete();
            });
        }
        if ($export || ! Schema::hasColumn('order_deliveries', 'customer_id')) {
            Schema::table('order_deliveries', function (Blueprint $t) {
                $t->unsignedBigInteger('customer_id')->nullable();
                $t->unsignedBigInteger('customer_address_id')->nullable();
                $t->string('neighborhood', 100)->nullable();
                $t->string('location_reference', 300)->nullable();
                $t->json('customer_snapshot')->nullable();
                $t->foreign(['tenant_id', 'branch_id', 'customer_id'], 'delivery_customer_fk')->references(['tenant_id', 'branch_id', 'id'])->on('customers')->restrictOnDelete();
                $t->foreign(['tenant_id', 'branch_id', 'customer_id', 'customer_address_id'], 'delivery_address_fk')->references(['tenant_id', 'branch_id', 'customer_id', 'id'])->on('customer_addresses')->restrictOnDelete();
            });
        }
        if ($export) {
            return;
        }
        DB::transaction(function () {
            PermissionCatalog::seed();
            $ids = DB::table('permissions')->whereIn('key', ['customers.view', 'customers.manage'])->pluck('id');
            foreach (DB::table('roles')->where('is_owner', true)->orWhereIn('name', ['Administrador', 'Supervisor', 'Cajero', 'Mesero'])->get() as $r) {
                foreach ($ids as $id) {
                    DB::table('role_permission')->insertOrIgnore(['tenant_id' => $r->tenant_id, 'role_id' => $r->id, 'permission_id' => $id]);
                }
            }
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar clientes, direcciones e historia de domicilios.');
    }
};
