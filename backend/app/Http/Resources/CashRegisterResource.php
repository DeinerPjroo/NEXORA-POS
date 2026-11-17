<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CashRegisterResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'branch_id' => $this->branch_id, 'name' => $this->name, 'code' => $this->code,
            'is_active' => $this->is_active,
            'current_session' => $this->whenLoaded('currentSession', fn () => $this->currentSession ? new CashSessionResource($this->currentSession) : null),
        ];
    }
}
