<?php

namespace App\Http\Resources;

use App\Domains\Sales\SaleBalance;
use App\Domains\Sales\SplitAccounts;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $this->resource->loadMissing('payments.courierCollection.settlements', 'payments.courierCollection.payment', 'payments.courierCollection.courier');
        if ($this->resource->relationLoaded('payment')) {
            $this->resource->loadMissing('payment.courierCollection.settlements', 'payment.courierCollection.payment', 'payment.courierCollection.courier');
        }
        $returned = app(SaleBalance::class)->refundedByPayment($this->resource);
        $payment = fn ($p) => [...$p->only('id', 'account_id', 'cash_session_id', 'amount', 'method', 'payment_method_id', 'method_name', 'method_kind', 'method_revision', 'provenance', 'reference', 'received_amount', 'change_amount', 'created_at'),
            'custody' => $p->courierCollection ? ['collection_id' => $p->courierCollection->id, 'courier_name' => $p->courierCollection->courier->name, 'pending' => $p->courierCollection->pending()] : null,
            'refunded_amount' => $returned[$p->id] ?? '0.0000', 'refundable_amount' => bcsub($p->amount, $returned[$p->id] ?? '0', 4)];

        return [
            ...app(SaleBalance::class)->amounts($this->resource),
            'revision' => $this->revision,
            'calculation_version' => $this->calculation_version,
            'delivery_charge' => $this->delivery_charge,
            'delivery_fee_total' => $this->delivery_fee_total,
            'tax_breakdown' => $this->tax_breakdown,
            'accounts' => $this->whenLoaded('accounts', fn () => app(SplitAccounts::class)->balances($this->resource)),
            ...$this->resource->only('discount_type', 'discount_value', 'tip_amount', 'tip_tax_mode', 'tip_confirmed'),
            ...$this->resource->only('id', 'order_id', 'branch_id', 'status', 'currency', 'business_name', 'branch_name', 'branch_address', 'catalog_subtotal', 'subtotal', 'rounding_adjustment', 'discount_amount', 'discount_reason', 'taxable_base', 'tax_mode', 'tax_name', 'tax_rate', 'tax_amount', 'total', 'settings_revision', 'created_at'),
            'receipt_code' => 'V-'.str_pad((string) $this->receipt_number, 6, '0', STR_PAD_LEFT),
            'payment' => $this->whenLoaded('payment', fn () => $this->payment ? $payment($this->payment) : null),
            'refund' => $this->whenLoaded('refund', fn () => $this->refund?->only('id', 'cash_session_id', 'amount', 'reason', 'reference', 'created_at')),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map($payment)),
            'refunds' => $this->whenLoaded('refunds', fn () => $this->refunds->map(fn ($r) => $r->only('id', 'payment_id', 'cash_session_id', 'amount', 'reason', 'reference', 'created_at'))),
            'items' => $this->whenLoaded('order', fn () => $this->order->items->map(fn ($item) => $item->only('id', 'product_name', 'variant_name', 'sku', 'quantity', 'unit_price', 'line_subtotal', 'notes', 'base_unit_price', 'modifiers_snapshot', 'price_snapshot', 'availability_snapshot', 'order_combo_id', 'combo_position'))),
            'combos' => $this->whenLoaded('order', fn () => OrderComboResource::collection($this->order->combos)),
            'reference' => $this->whenLoaded('order', fn () => $this->order->reference),
            'customer_name' => $this->whenLoaded('order', fn () => $this->order->customer_name),
            'channel' => $this->whenLoaded('order', fn () => $this->order->channel),
            'dining_snapshot' => $this->whenLoaded('order', fn () => $this->order->dining_snapshot),
        ];
    }
}
