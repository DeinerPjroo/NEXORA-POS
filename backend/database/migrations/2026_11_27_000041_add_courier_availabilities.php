<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('courier_availabilities', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('tenant_id');
            $t->unsignedBigInteger('branch_id');
            $t->unsignedBigInteger('user_id');
            $t->boolean('available');
            $t->unsignedInteger('revision')->default(1);
            $t->timestamps();
            $t->unique(['tenant_id', 'branch_id', 'user_id'], 'courier_availability_identity');
            $t->foreign(['tenant_id', 'branch_id'])->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
            $t->foreign(['tenant_id', 'user_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('courier_availabilities');
    }
};
