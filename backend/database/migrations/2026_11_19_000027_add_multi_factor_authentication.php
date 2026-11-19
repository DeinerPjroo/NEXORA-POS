<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('mfa_secret')->nullable();
            $table->text('mfa_recovery_hashes')->nullable();
            $table->dateTime('mfa_enabled_at')->nullable();
            $table->unsignedBigInteger('mfa_last_step')->nullable();
            $table->unsignedInteger('mfa_version')->default(1);
            $table->text('mfa_pending_secret')->nullable();
            $table->uuid('mfa_pending_id')->nullable();
            $table->dateTime('mfa_pending_expires_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['mfa_secret', 'mfa_recovery_hashes', 'mfa_enabled_at', 'mfa_last_step', 'mfa_version', 'mfa_pending_secret', 'mfa_pending_id', 'mfa_pending_expires_at']));
    }
};
