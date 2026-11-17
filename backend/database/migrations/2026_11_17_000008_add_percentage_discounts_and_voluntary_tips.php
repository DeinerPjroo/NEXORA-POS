<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_settings', function (Blueprint $table) {
            $table->boolean('tip_enabled')->default(false);
            $table->string('tip_tax_mode', 20)->nullable();
        });
        Schema::table('sales', function (Blueprint $table) {
            $table->string('discount_type', 20)->default('fixed');
            $table->decimal('discount_value', 19, 4)->default(0);
            $table->decimal('tip_amount', 19, 4)->default(0);
            $table->boolean('tip_confirmed')->default(false);
            $table->string('tip_tax_mode', 20)->default('disabled');
        });
        if (DB::connection()->pretending()) {
            return;
        }
        DB::table('sales')->update(['discount_value' => DB::raw('discount_amount')]);
        DB::table('permissions')->updateOrInsert(['key' => 'sales.tips'], ['name' => 'Registrar propinas voluntarias', 'group' => 'Ventas']);
        $id = DB::table('permissions')->where('key', 'sales.tips')->value('id');
        DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(200, function ($roles) use ($id) {
            foreach ($roles as $role) {
                DB::table('role_permission')->insertOrIgnore(['tenant_id' => $role->tenant_id, 'role_id' => $role->id, 'permission_id' => $id]);
            }
        });
    }

    public function down(): void
    {
        throw new RuntimeException('No eliminar snapshots de descuento o propina mediante rollback financiero automático.');
    }
};
