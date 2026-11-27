<?php

namespace App\Domains\Kitchen;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

final class KitchenChanged implements ShouldBroadcastNow
{
    public function __construct(private int $tenantId, private int $branchId) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('kitchen.'.$this->tenantId.'.'.$this->branchId)];
    }

    public function broadcastAs(): string
    {
        return 'kitchen.changed';
    }

    public function broadcastWith(): array
    {
        return ['refresh' => true];
    }
}
