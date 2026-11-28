<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('courier_cash_accounts', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('tenant_id');
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('courier_id');
            $t->string('currency', 3);
            $t->decimal('balance', 19, 4)->default(0);
            $t->unsignedInteger('revision')->default(0);
            $t->timestamps();
            $t->unique(['tenant_id', 'branch_id', 'courier_id', 'currency'], 'courier_cash_identity');
            $t->unique(['tenant_id', 'branch_id', 'id'], 'courier_cash_branch_identity');
            $t->foreign(['tenant_id', 'branch_id'])->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
            $t->foreign(['tenant_id', 'courier_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
        Schema::create('courier_cash_transfers', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('tenant_id');
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('courier_cash_account_id');
            $t->unsignedBigInteger('cash_session_id');
            $t->unsignedBigInteger('cash_movement_id');
            $t->unsignedBigInteger('actor_id');
            $t->string('kind', 20);
            $t->decimal('amount', 19, 4);
            $t->decimal('balance_after', 19, 4);
            $t->unsignedInteger('account_revision');
            $t->string('reason', 250);
            $t->boolean('confirmed_handover');
            $t->timestamp('created_at');
            $t->unique(['tenant_id', 'cash_movement_id'], 'courier_cash_movement_unique');
            $t->foreign(['tenant_id', 'branch_id', 'courier_cash_account_id'], 'courier_transfer_account_fk')->references(['tenant_id', 'branch_id', 'id'])->on('courier_cash_accounts')->restrictOnDelete();
            $t->foreign(['tenant_id', 'branch_id', 'cash_session_id'], 'courier_transfer_session_fk')->references(['tenant_id', 'branch_id', 'id'])->on('cash_sessions')->restrictOnDelete();
            $t->foreign(['tenant_id', 'cash_session_id', 'cash_movement_id'], 'courier_transfer_movement_fk')->references(['tenant_id', 'cash_session_id', 'id'])->on('cash_movements')->restrictOnDelete();
            $t->foreign(['tenant_id', 'actor_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('courier_cash_transfers');
        Schema::dropIfExists('courier_cash_accounts');
    }
};
