<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen_tickets', function (Blueprint $table) {
            $table->unsignedTinyInteger('priority')->default(0);
            $table->index(['tenant_id', 'branch_id', 'priority', 'created_at', 'id'], 'kitchen_priority_queue');
        });
    }

    public function down(): void
    {
        Schema::table('kitchen_tickets', function (Blueprint $table) {
            $table->dropIndex('kitchen_priority_queue');
            $table->dropColumn('priority');
        });
    }
};
