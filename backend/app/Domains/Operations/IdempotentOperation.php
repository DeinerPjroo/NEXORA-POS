<?php

namespace App\Domains\Operations;

use App\Models\IdempotencyRecord;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

final class IdempotentOperation
{
    public function run(User $actor, string $action, array $data, string $model, callable $operation): Model
    {
        $key = $data['idempotency_key'];
        unset($data['idempotency_key']);
        $hash = hash('sha256', json_encode($this->canonical($data), JSON_THROW_ON_ERROR));
        return DB::transaction(function () use ($actor, $action, $data, $key, $hash, $model, $operation) {
            Tenant::whereKey($actor->tenant_id)->lockForUpdate()->firstOrFail();
            $record = IdempotencyRecord::where('key', $key)->first();
            if ($record) {
                abort_unless($record->action === $action && (int) $record->actor_id === $actor->id && hash_equals($record->request_hash, $hash) && $record->resource_type === $model, 409, 'La clave de operación ya se usó con otro contenido.');
                return $model::findOrFail($record->resource_id);
            }
            $result = $operation($data);
            IdempotencyRecord::create(['key' => $key, 'actor_id' => $actor->id, 'action' => $action, 'request_hash' => $hash, 'resource_type' => $model, 'resource_id' => $result->id, 'created_at' => now()]);
            return $result;
        });
    }

    private function canonical(mixed $value): mixed
    {
        if (!is_array($value)) return $value;
        if (!array_is_list($value)) ksort($value);
        foreach ($value as &$item) $item = $this->canonical($item);
        return $value;
    }
}
