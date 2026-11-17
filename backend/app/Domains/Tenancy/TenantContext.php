<?php

namespace App\Domains\Tenancy;

use LogicException;

final class TenantContext
{
    private ?int $id = null;

    public function set(int $id): void
    {
        $this->id = $id;
    }

    public function id(): int
    {
        return $this->id ?? throw new LogicException('Se requiere un contexto de empresa.');
    }

    public function clear(): void
    {
        $this->id = null;
    }

    public function run(int $id, callable $operation): mixed
    {
        $previous = $this->id;
        $this->id = $id;
        try {
            return $operation();
        } finally {
            $this->id = $previous;
        }
    }
}
