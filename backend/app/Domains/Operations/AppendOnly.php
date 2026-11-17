<?php

namespace App\Domains\Operations;

use LogicException;

trait AppendOnly
{
    protected static function bootAppendOnly(): void
    {
        static::updating(fn () => throw new LogicException('El registro histórico no se puede modificar.'));
        static::deleting(fn () => throw new LogicException('El registro histórico no se puede eliminar.'));
    }
}
