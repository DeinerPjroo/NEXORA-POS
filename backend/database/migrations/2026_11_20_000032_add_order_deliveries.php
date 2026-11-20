<?php
use App\Domains\Identity\PermissionCatalog;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB,Schema};
return new class extends Migration {
 public function up(): void {
  $export=DB::connection()->pretending();
  if($export || !Schema::hasTable('order_deliveries')) Schema::create('order_deliveries',function(Blueprint $t){
   $t->id();$t->unsignedBigInteger('tenant_id');$t->unsignedBigInteger('branch_id');$t->unsignedBigInteger('order_id');$t->unsignedBigInteger('courier_id')->nullable();
   $t->string('recipient_name',100);$t->string('phone',30);$t->string('address',300);$t->string('instructions',300)->nullable();
   $t->string('status',24)->default('pending');$t->unsignedInteger('revision')->default(1);$t->timestamp('out_at')->nullable();$t->timestamp('delivered_at')->nullable();$t->timestamps();
   $t->unique(['tenant_id','order_id']);$t->unique(['tenant_id','order_id','id'],'delivery_order_identity');
   $t->foreign(['tenant_id','branch_id','order_id'],'delivery_order_fk')->references(['tenant_id','branch_id','id'])->on('orders')->restrictOnDelete();
   $t->foreign(['tenant_id','courier_id'])->references(['tenant_id','id'])->on('users')->restrictOnDelete();
  });
  if($export || !Schema::hasTable('delivery_events')) Schema::create('delivery_events',function(Blueprint $t){
   $t->id();$t->unsignedBigInteger('tenant_id');$t->unsignedBigInteger('order_id');$t->unsignedBigInteger('order_delivery_id');$t->unsignedBigInteger('actor_id');
   $t->string('status',24);$t->unsignedBigInteger('courier_id')->nullable();$t->string('reason',250)->nullable();$t->timestamp('created_at');
   $t->foreign(['tenant_id','order_id','order_delivery_id'],'delivery_event_parent')->references(['tenant_id','order_id','id'])->on('order_deliveries')->restrictOnDelete();
   $t->foreign(['tenant_id','actor_id'])->references(['tenant_id','id'])->on('users')->restrictOnDelete();
   $t->foreign(['tenant_id','courier_id'])->references(['tenant_id','id'])->on('users')->restrictOnDelete();
  });
  if($export)return;
  DB::transaction(function(){PermissionCatalog::seed();$id=DB::table('permissions')->where('key','deliveries.operate')->value('id');foreach(DB::table('roles')->where('is_owner',true)->orWhere('name','Repartidor')->get() as $r)DB::table('role_permission')->insertOrIgnore(['tenant_id'=>$r->tenant_id,'role_id'=>$r->id,'permission_id'=>$id]);});
 }
 public function down():void {throw new LogicException('Conservar historia de entregas.');}
};
