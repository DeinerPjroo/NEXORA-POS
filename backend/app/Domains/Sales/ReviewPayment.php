<?php

namespace App\Domains\Sales;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Operations\Money;
use App\Models\Payment;
use App\Models\PaymentReview;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class ReviewPayment
{
    public function execute(User $actor, Payment $payment, array $data): PaymentReview
    {
        Gate::authorize('sales.reconcile');

        return app(IdempotentOperation::class)->run($actor, 'payment.review.'.$payment->id, $data, PaymentReview::class, function ($data) use ($actor, $payment) {
            $sale = Sale::whereKey($payment->sale_id)->lockForUpdate()->firstOrFail();
            abort_unless($payment->method_kind === 'non_cash', 422, 'La revisión manual corresponde a pagos no efectivos. El efectivo se revisa en caja.');
            $payment->load(['refunds', 'latestReview']);
            $net = app(PaymentBalance::class)->amounts($payment)['net_paid_amount'];
            $version = $payment->latestReview?->version ?? 0;
            abort_unless($sale->revision === (int) $data['sale_revision'] && $version === (int) $data['review_revision'] && bccomp($net, $data['expected_net_amount'], 4) === 0, 409, 'El pago, la venta o su revisión cambiaron. Consulta los datos actuales antes de revisar.');
            $observed = $data['status'] === 'pending' ? null : Money::normalize($data['observed_amount']);
            $difference = $observed === null ? null : bcsub($observed, $net, 4);
            if (($data['status'] === 'matched' && bccomp($difference, '0', 4) !== 0) || ($data['status'] === 'difference' && bccomp($difference, '0', 4) === 0)) {
                throw ValidationException::withMessages(['observed_amount' => 'El importe observado debe corresponder al estado elegido: igual para revisado y distinto para diferencia.']);
            }
            $review = PaymentReview::create(['branch_id' => $payment->branch_id, 'sale_id' => $sale->id, 'payment_id' => $payment->id,
                'actor_id' => $actor->id, 'actor_name' => $actor->name, 'version' => $version + 1, 'sale_revision' => $sale->revision, 'currency' => $sale->currency,
                'status' => $data['status'], 'expected_net_amount' => $net, 'observed_amount' => $observed, 'difference_amount' => $difference,
                'reference' => $data['reference'] ?? null, 'notes' => $data['notes'] ?? null, 'review_confirmed' => true, 'provenance' => 'operator', 'created_at' => now()]);
            Audit::record('payment.manually_reviewed', 'Se registró una declaración de revisión humana sin modificar importes financieros.', $actor, ['payment_id' => $payment->id, 'review_id' => $review->id, 'version' => $review->version, 'status' => $review->status, 'provenance' => 'operator']);

            return $review;
        });
    }
}
