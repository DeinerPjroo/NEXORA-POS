<?php
namespace App\Models;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
final class OrderDelivery extends Model {
 use BelongsToTenant;
 protected $guarded=['id','tenant_id'];
 protected function casts():array{return ['revision'=>'integer','out_at'=>'datetime','delivered_at'=>'datetime'];}
 public function events():\Illuminate\Database\Eloquent\Relations\HasMany{return $this->hasMany(DeliveryEvent::class)->orderBy('id');}
 public function order():\Illuminate\Database\Eloquent\Relations\BelongsTo{return $this->belongsTo(Order::class);}
 public function courier():\Illuminate\Database\Eloquent\Relations\BelongsTo{return $this->belongsTo(User::class,'courier_id');}
}
