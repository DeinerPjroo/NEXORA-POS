<?php

namespace App\Models;

use App\Domains\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

final class TaxProfile extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['rates' => 'array', 'is_active' => 'boolean', 'revision' => 'integer'];
    }

    protected static function booted(): void
    {
        self::deleting(fn () => throw new \LogicException('Los perfiles de impuestos se archivan, no se eliminan.'));
    }

    public function snapshot(): array
    {
        return ['profile_id' => $this->id, ...$this->only('name', 'price_mode', 'rates', 'revision')];
    }
}
