<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('pin_hash')->nullable();
            $table->unsignedInteger('security_revision')->default(1);
        });
        Schema::create('screen_locks', function (Blueprint $table) {
            // Never persist the bearer session identifier in this table.
            $table->string('session_hash', 64)->primary();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('user_id');
            $table->uuid('challenge');
            $table->dateTime('created_at');
            $table->foreign(['tenant_id', 'user_id'])->references(['tenant_id', 'id'])->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('screen_locks');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['pin_hash', 'security_revision']));
    }
};
