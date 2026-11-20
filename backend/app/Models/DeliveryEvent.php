<?php
namespace App\Models;
use App\Domains\Tenancy\BelongsToTenant;
use App\Domains\Operations\AppendOnly;
use Illuminate\Database\Eloquent\Model;
final class DeliveryEvent extends Model {
 use BelongsToTenant,AppendOnly;
 public $timestamps=false;
 protected $guarded=['id','tenant_id'];
 protected function casts():array{return ['created_at'=>'datetime'];}
}
