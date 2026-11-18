<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('branch_id');
            $table->unsignedBigInteger('sale_id');
            $table->unsignedBigInteger('payment_id');
            $table->unsignedBigInteger('actor_id');
            $table->string('actor_name', 120);
            $table->unsignedInteger('version');
            $table->unsignedInteger('sale_revision');
            $table->char('currency', 3);
            $table->string('status', 20);
            $table->decimal('expected_net_amount', 19, 4);
            $table->decimal('observed_amount', 19, 4)->nullable();
            $table->decimal('difference_amount', 19, 4)->nullable();
            $table->string('reference', 120)->nullable();
            $table->string('notes', 300)->nullable();
            $table->boolean('review_confirmed');
            $table->string('provenance', 30);
            $table->timestamp('created_at');
            $table->unique(['tenant_id', 'payment_id', 'version']);
            $table->index(['tenant_id', 'payment_id', 'id']);
            $table->foreign(['tenant_id', 'sale_id', 'payment_id'], 'payment_reviews_payment_fk')->references(['tenant_id', 'sale_id', 'id'])->on('payments')->restrictOnDelete();
            $table->foreign(['tenant_id', 'branch_id', 'sale_id'], 'payment_reviews_sale_fk')->references(['tenant_id', 'branch_id', 'id'])->on('sales')->restrictOnDelete();
            $table->foreign(['tenant_id', 'actor_id'], 'payment_reviews_actor_fk')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        if (DB::connection()->pretending()) {
            return;
        }
        DB::table('permissions')->updateOrInsert(['key' => 'sales.reconcile'], ['name' => 'Revisar pagos no efectivos manualmente', 'group' => 'Ventas']);
        $id = DB::table('permissions')->where('key', 'sales.reconcile')->value('id');
        DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(200, function ($roles) use ($id) {
            foreach ($roles as $role) {
                DB::table('role_permission')->insertOrIgnore(['tenant_id' => $role->tenant_id, 'role_id' => $role->id, 'permission_id' => $id]);
            }
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Las declaraciones históricas de revisión de pagos no se eliminan automáticamente.');
    }
};
