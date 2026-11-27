<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen_stations', fn (Blueprint $table) => $table->json('display_settings')->nullable());
        Schema::table('kitchen_tickets', fn (Blueprint $table) => $table->json('display_snapshot')->nullable());
    }

    public function down(): void
    {
        Schema::table('kitchen_tickets', fn (Blueprint $table) => $table->dropColumn('display_snapshot'));
        Schema::table('kitchen_stations', fn (Blueprint $table) => $table->dropColumn('display_settings'));
    }
};
