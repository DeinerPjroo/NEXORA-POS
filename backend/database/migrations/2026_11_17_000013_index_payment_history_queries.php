<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->index(['tenant_id', 'created_at', 'id'], 'payments_history_company_idx');
            $table->index(['tenant_id', 'branch_id', 'created_at', 'id'], 'payments_history_branch_idx');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex('payments_history_company_idx');
            $table->dropIndex('payments_history_branch_idx');
        });
    }
};
