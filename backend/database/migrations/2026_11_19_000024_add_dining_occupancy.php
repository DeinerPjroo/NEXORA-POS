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
        Schema::create('dining_sessions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('opened_by');
            $t->unsignedBigInteger('closed_by')->nullable();
            $t->unsignedBigInteger('waiter_id')->nullable();
            $t->unsignedSmallInteger('guest_count');
            $t->string('notes', 300)->nullable();
            $t->string('status', 12)->default('open');
            $t->unsignedInteger('revision')->default(1);
            $t->timestamp('opened_at');
            $t->timestamp('closed_at')->nullable();
            $t->timestamps();
            $t->unique(['tenant_id', 'branch_id', 'id'], 'dining_sessions_branch_identity');
            $t->unique(['tenant_id', 'id']);
            $t->index(['tenant_id', 'branch_id', 'status', 'id']);
            $t->foreign(['tenant_id', 'branch_id'])->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
            foreach (['opened_by', 'closed_by', 'waiter_id'] as $actor) {
                $t->foreign(['tenant_id', $actor])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
            }
        });
        Schema::create('dining_session_tables', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('dining_session_id');
            $t->unsignedBigInteger('dining_table_id');
            $t->string('table_name', 50);
            $t->timestamp('joined_at');
            $t->timestamp('released_at')->nullable();
            $t->unsignedBigInteger('occupied_table')->storedAs('CASE WHEN released_at IS NULL THEN dining_table_id ELSE NULL END');
            $t->unique(['tenant_id', 'occupied_table'], 'dining_active_table_unique');
            $t->index(['tenant_id', 'dining_session_id', 'released_at'], 'dining_members_session_release_idx');
            $t->foreign(['tenant_id', 'branch_id', 'dining_session_id'], 'dining_members_session_fk')->references(['tenant_id', 'branch_id', 'id'])->on('dining_sessions')->restrictOnDelete();
            $t->foreign(['tenant_id', 'branch_id', 'dining_table_id'], 'dining_members_table_fk')->references(['tenant_id', 'branch_id', 'id'])->on('dining_tables')->restrictOnDelete();
        });
        Schema::create('dining_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('dining_session_id');
            $t->unsignedBigInteger('actor_id');
            $t->string('action', 40);
            $t->json('details');
            $t->timestamp('created_at');
            $t->index(['tenant_id', 'dining_session_id', 'id']);
            $t->foreign(['tenant_id', 'dining_session_id'])->references(['tenant_id', 'id'])->on('dining_sessions')->restrictOnDelete();
            $t->foreign(['tenant_id', 'actor_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        Schema::table('orders', function (Blueprint $t) {
            $t->unsignedBigInteger('dining_session_id')->nullable();
            $t->json('dining_snapshot')->nullable();
            $t->foreign(['tenant_id', 'branch_id', 'dining_session_id'], 'orders_dining_session_fk')->references(['tenant_id', 'branch_id', 'id'])->on('dining_sessions')->restrictOnDelete();
            $t->index(['tenant_id', 'dining_session_id', 'id']);
        });
        if (DB::connection()->pretending()) {
            return;
        }
        [$name,$group] = PermissionCatalog::ALL['dining.operate'];
        DB::table('permissions')->updateOrInsert(['key' => 'dining.operate'], ['name' => $name, 'group' => $group]);
        $id = DB::table('permissions')->where('key', 'dining.operate')->value('id');
        DB::table('roles')->where('is_owner', true)->orderBy('id')->chunkById(100, function ($roles) use ($id) {
            foreach ($roles as $r) {
                DB::table('role_permission')->insertOrIgnore(['tenant_id' => $r->tenant_id, 'role_id' => $r->id, 'permission_id' => $id]);
            }
        });
    }

    public function down(): void
    {
        throw new RuntimeException('La ocupación y sus referencias históricas se conservan.');
    }
};
