<?php

namespace App\Http\Resources;

use App\Domains\Sales\SaleBalance;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            ...app(SaleBalance::class)->amounts($this->resource),
            'revision' => $this->revision,
            ...$this->resource->only('discount_type', 'discount_value', 'tip_amount', 'tip_tax_mode', 'tip_confirmed'),
            ...$this->resource->only('id', 'order_id', 'branch_id', 'status', 'currency', 'business_name', 'branch_name', 'branch_address', 'catalog_subtotal', 'subtotal', 'rounding_adjustment', 'discount_amount', 'discount_reason', 'taxable_base', 'tax_mode', 'tax_name', 'tax_rate', 'tax_amount', 'total', 'settings_revision', 'created_at'),
            'receipt_code' => 'V-'.str_pad((string) $this->receipt_number, 6, '0', STR_PAD_LEFT),
            'payment' => $this->whenLoaded('payment', fn () => $this->payment?->only('id', 'cash_session_id', 'amount', 'method', 'payment_method_id', 'method_name', 'method_kind', 'method_revision', 'provenance', 'reference', 'received_amount', 'change_amount', 'created_at')),
            'refund' => $this->whenLoaded('refund', fn () => $this->refund?->only('id', 'cash_session_id', 'amount', 'reason', 'reference', 'created_at')),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => $p->only('id', 'cash_session_id', 'amount', 'method', 'payment_method_id', 'method_name', 'method_kind', 'method_revision', 'provenance', 'reference', 'received_amount', 'change_amount', 'created_at'))),
            'refunds' => $this->whenLoaded('refunds', fn () => $this->refunds->map(fn ($r) => $r->only('id', 'payment_id', 'cash_session_id', 'amount', 'reason', 'reference', 'created_at'))),
            'items' => $this->whenLoaded('order', fn () => $this->order->items->map(fn ($item) => $item->only('id', 'product_name', 'variant_name', 'sku', 'quantity', 'unit_price', 'line_subtotal', 'notes'))),
            'reference' => $this->whenLoaded('order', fn () => $this->order->reference),
        ];
    }
}
