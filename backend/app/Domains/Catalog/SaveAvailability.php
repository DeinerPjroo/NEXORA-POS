<?php

namespace App\Domains\Catalog;

use App\Domains\Identity\Audit;
use App\Domains\Operations\IdempotentOperation;
use App\Models\Product;
use App\Models\ProductAvailabilityWindow;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class SaveAvailability
{
    public function policy(User $actor, Product $product, array $data): Product
    {
        Gate::authorize('update', $product);

        return app(IdempotentOperation::class)->run($actor, 'catalog.availability-policy.update.'.$product->id, $data, Product::class, function ($data) use ($actor, $product) {
            $product = app(ModifierProductContext::class)->lock($actor, $product, $data, 'horarios');
            $this->assertTimezone($actor, $data);
            $product->availability_schedule_enabled = $data['enabled'];
            $product->revision++;
            $product->save();
            Audit::record('catalog.availability_policy.updated', 'Se configuró la aplicación de horarios de producto.', $actor, ['product_id' => $product->id, 'enabled' => $product->availability_schedule_enabled, 'revision' => $product->revision]);

            return $product;
        });
    }

    public function window(User $actor, Product $product, array $data, ?ProductAvailabilityWindow $window = null): ProductAvailabilityWindow
    {
        Gate::authorize('update', $product);
        $action = $window ? 'catalog.availability-window.update.'.$window->id : 'catalog.availability-window.create.'.$product->id;

        return app(IdempotentOperation::class)->run($actor, $action, $data, ProductAvailabilityWindow::class, function ($data) use ($actor, $product, $window) {
            $product = app(ModifierProductContext::class)->lock($actor, $product, $data, 'horarios');
            $this->assertTimezone($actor, $data);
            $existing = $window !== null;
            $window = $existing ? $product->availabilityWindows()->lockForUpdate()->findOrFail($window->id) : new ProductAvailabilityWindow;
            abort_if($existing && $window->revision !== (int) $data['revision'], 409, 'La ventana de disponibilidad cambió. Actualiza su configuración.');
            if ($data['is_active'] && $product->availabilityWindows()->where('is_active', true)->when($existing, fn ($q) => $q->whereKeyNot($window->id))->count() >= 28) {
                throw ValidationException::withMessages(['is_active' => 'Un producto admite hasta 28 ventanas activas. Archiva alguna antes de agregar otra.']);
            }
            $window->product_id = $product->id;
            $window->fill(array_intersect_key($data, array_flip($window->getFillable())));
            $window->revision = $existing ? $window->revision + 1 : 1;
            $window->save();
            $product->revision++;
            $product->save();
            Audit::record('catalog.availability_window.'.($existing ? 'updated' : 'created'), 'Se guardó una ventana de disponibilidad.', $actor, ['product_id' => $product->id, 'window_id' => $window->id, 'revision' => $window->revision, 'product_revision' => $product->revision]);

            return $window->refresh();
        });
    }

    private function assertTimezone(User $actor, array $data): void
    {
        abort_unless($actor->tenant()->value('timezone') === $data['expected_timezone'], 409, 'La zona horaria de la empresa cambió. Actualiza la ficha antes de guardar horarios.');
    }
}
