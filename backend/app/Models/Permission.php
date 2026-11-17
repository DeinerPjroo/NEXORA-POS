<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class Permission extends Model
{
    public $timestamps = false;

    protected $fillable = ['key', 'name', 'group'];
}
