<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CashSessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'cash_register_id' => $this->cash_register_id, 'branch_id' => $this->branch_id,
            'register_name' => $this->whenLoaded('register', fn () => $this->register->name),
            'status' => $this->status, 'currency' => $this->currency, 'opening_amount' => $this->opening_amount,
            'expected_amount' => $this->expected_amount, 'counted_amount' => $this->counted_amount, 'difference' => $this->difference,
            'closing_note' => $this->closing_note, 'revision' => $this->revision,
            'opened_at' => $this->opened_at, 'closed_at' => $this->closed_at,
        ];
    }
}
