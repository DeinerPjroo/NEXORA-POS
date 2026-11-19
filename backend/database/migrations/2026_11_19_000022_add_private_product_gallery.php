<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('path');
            $table->string('mime', 30);
            $table->unsignedTinyInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['tenant_id', 'product_id', 'id'], 'product_images_identity');
            $table->foreign(['tenant_id', 'product_id'], 'product_images_product_fk')->references(['tenant_id', 'id'])->on('products')->restrictOnDelete();
            $table->index(['tenant_id', 'product_id', 'is_active', 'position'], 'product_images_order');
        });
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedBigInteger('cover_image_id')->nullable();
            $table->foreign(['tenant_id', 'id', 'cover_image_id'], 'products_cover_image_fk')->references(['tenant_id', 'product_id', 'id'])->on('product_images')->restrictOnDelete();
        });
        $this->backfill();
    }

    public function backfill(): void
    {
        DB::table('products')->whereNotNull('image_path')->whereNull('cover_image_id')->orderBy('id')->chunkById(100, function ($products) {
            foreach ($products as $product) {
                DB::transaction(function () use ($product) {
                    DB::table('tenants')->where('id', $product->tenant_id)->lockForUpdate()->first();
                    $current = DB::table('products')->where('id', $product->id)->whereNull('cover_image_id')->whereNotNull('image_path')->lockForUpdate()->first();
                    if (! $current) {
                        return;
                    }
                    $id = DB::table('product_images')->insertGetId(['tenant_id' => $current->tenant_id, 'product_id' => $current->id, 'path' => $current->image_path, 'mime' => $current->image_mime ?? 'application/octet-stream', 'position' => 0, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
                    DB::table('products')->where('id', $current->id)->update(['cover_image_id' => $id]);
                });
            }
        });
    }

    public function down(): void
    {
        throw new RuntimeException('La galería y sus referencias de portada se conservan.');
    }
};
