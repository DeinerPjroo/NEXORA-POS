<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class PaymentMethod extends Model
{
    use BelongsToTenant;

    protected $fillable = ['code', 'name', 'kind', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'is_system' => 'boolean', 'revision' => 'integer'];
    }
}
