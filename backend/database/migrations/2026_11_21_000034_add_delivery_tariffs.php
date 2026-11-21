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
        if ($export || ! Schema::hasTable('delivery_policies')) {
            Schema::create('delivery_policies', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('tenant_id');
                $t->unsignedBigInteger('branch_id');
                $t->string('currency', 3);
                $t->boolean('is_enabled')->default(false);
                $t->decimal('default_fee', 19, 4)->default(0);
                $t->decimal('free_from', 19, 4)->nullable();
                $t->unsignedBigInteger('tax_profile_id')->nullable();
                $t->unsignedInteger('revision')->default(1);
                $t->timestamps();
                $t->unique(['tenant_id', 'branch_id']);
                $t->unique(['tenant_id', 'branch_id', 'id'], 'delivery_policy_identity');
                $t->foreign(['tenant_id', 'branch_id'])->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
                $t->foreign(['tenant_id', 'tax_profile_id'])->references(['tenant_id', 'id'])->on('tax_profiles')->restrictOnDelete();
            });
        }
        if ($export || ! Schema::hasTable('delivery_zones')) {
            Schema::create('delivery_zones', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('tenant_id');
                $t->unsignedBigInteger('branch_id');
                $t->unsignedBigInteger('delivery_policy_id');
                $t->string('name', 100);
                $t->decimal('fee', 19, 4);
                $t->boolean('is_active')->default(true);
                $t->unsignedInteger('revision')->default(1);
                $t->timestamps();
                $t->unique(['tenant_id', 'delivery_policy_id', 'name'], 'delivery_zone_name');
                $t->unique(['tenant_id', 'branch_id', 'delivery_policy_id', 'id'], 'delivery_zone_identity');
                $t->foreign(['tenant_id', 'branch_id', 'delivery_policy_id'], 'delivery_zone_policy_fk')->references(['tenant_id', 'branch_id', 'id'])->on('delivery_policies')->restrictOnDelete();
            });
        }
        if ($export || ! Schema::hasColumn('order_deliveries', 'fee_snapshot')) {
            Schema::table('order_deliveries', function (Blueprint $t) {
                $t->unsignedBigInteger('delivery_policy_id')->nullable();
                $t->unsignedBigInteger('delivery_zone_id')->nullable();
                $t->json('fee_snapshot')->nullable();
                $t->decimal('fee_total', 19, 4)->default(0);
                $t->foreign(['tenant_id', 'branch_id', 'delivery_policy_id'], 'delivery_policy_order_fk')->references(['tenant_id', 'branch_id', 'id'])->on('delivery_policies')->restrictOnDelete();
                $t->foreign(['tenant_id', 'branch_id', 'delivery_policy_id', 'delivery_zone_id'], 'delivery_zone_order_fk')->references(['tenant_id', 'branch_id', 'delivery_policy_id', 'id'])->on('delivery_zones')->restrictOnDelete();
            });
        }
        if ($export || ! Schema::hasColumn('sales', 'delivery_charge')) {
            Schema::table('sales', function (Blueprint $t) {
                $t->json('delivery_charge')->nullable();
                $t->decimal('delivery_fee_total', 19, 4)->default(0);
            });
        }
        if ($export) {
            return;
        }
        DB::transaction(function () {
            PermissionCatalog::seed();
            $ids = DB::table('permissions')->whereIn('key', ['deliveries.configure', 'deliveries.override_fee'])->pluck('id');
            foreach (DB::table('roles')->where('is_owner', true)->orWhere('name', 'Administrador')->get() as $r) {
                foreach ($ids as $id) {
                    DB::table('role_permission')->insertOrIgnore(['tenant_id' => $r->tenant_id, 'role_id' => $r->id, 'permission_id' => $id]);
                }
            }
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar tarifas y snapshots financieros históricos.');
    }
};
