<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class Tenant extends Model
{
    protected $fillable = ['name', 'public_id', 'business_type', 'currency', 'timezone', 'locale'];
}
