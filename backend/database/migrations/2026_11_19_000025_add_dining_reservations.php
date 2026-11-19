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
        Schema::create('dining_reservations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('created_by');
            $t->unsignedBigInteger('dining_session_id')->nullable();
            $t->string('guest_name', 100);
            $t->string('phone', 30)->nullable();
            $t->unsignedSmallInteger('guest_count');
            $t->string('notes', 300)->nullable();
            $t->string('status', 12)->default('booked');
            $t->string('booking_timezone', 64);
            $t->dateTime('starts_at');
            $t->dateTime('ends_at');
            $t->unsignedInteger('revision')->default(1);
            $t->timestamps();
            $t->unique(['tenant_id', 'branch_id', 'id'], 'dining_reservations_branch_identity');
            $t->index(['tenant_id', 'branch_id', 'status', 'starts_at'], 'dining_reservations_calendar_idx');
            $t->foreign(['tenant_id', 'branch_id'], 'dining_reservations_branch_fk')->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
            $t->foreign(['tenant_id', 'created_by'], 'dining_reservations_creator_fk')->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
            $t->foreign(['tenant_id', 'branch_id', 'dining_session_id'], 'dining_reservations_session_fk')->references(['tenant_id', 'branch_id', 'id'])->on('dining_sessions')->restrictOnDelete();
        });
        Schema::create('dining_reservation_tables', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('dining_reservation_id');
            $t->unsignedBigInteger('dining_table_id');
            $t->string('table_name', 50);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unsignedBigInteger('current_table')->storedAs('CASE WHEN is_active = 1 THEN dining_table_id ELSE NULL END');
            $t->unique(['tenant_id', 'dining_reservation_id', 'current_table'], 'dining_reservation_current_table_unique');
            $t->index(['tenant_id', 'dining_table_id', 'is_active'], 'dining_reservation_table_calendar_idx');
            $t->foreign(['tenant_id', 'branch_id', 'dining_reservation_id'], 'dining_reservation_members_reservation_fk')->references(['tenant_id', 'branch_id', 'id'])->on('dining_reservations')->restrictOnDelete();
            $t->foreign(['tenant_id', 'branch_id', 'dining_table_id'], 'dining_reservation_members_table_fk')->references(['tenant_id', 'branch_id', 'id'])->on('dining_tables')->restrictOnDelete();
        });
        if (DB::connection()->pretending()) {
            return;
        }
        [$name,$group] = PermissionCatalog::ALL['dining.reserve'];
        DB::table('permissions')->updateOrInsert(['key' => 'dining.reserve'], ['name' => $name, 'group' => $group]);
        $id = DB::table('permissions')->where('key', 'dining.reserve')->value('id');
        DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(100, function ($roles) use ($id) {
            foreach ($roles as $r) {
                DB::table('role_permission')->insertOrIgnore(['tenant_id' => $r->tenant_id, 'role_id' => $r->id, 'permission_id' => $id]);
            }
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Las reservas y su historia se conservan.');
    }
};
