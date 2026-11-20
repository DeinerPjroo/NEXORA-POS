<?php
namespace App\Models;
use App\Domains\Operations\AppendOnly;
use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
final class PreparationCorrection extends Model {
 use AppendOnly, BelongsToTenant;
 public $timestamps=false;
 protected $guarded=['id','tenant_id'];
 protected function casts(): array { return ['created_at'=>'datetime']; }
}
