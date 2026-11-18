<?php

namespace App\Domains\Catalog;

use App\Models\Product;
use App\Models\ProductVariant;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

final class CatalogEligibility
{
    public function decorate(Collection $products, string $timezone, ?CarbonImmutable $instant = null): void
    {
        $instant ??= CarbonImmutable::now();
        app(AvailabilitySchedule::class)->decorate($products, $timezone, $instant);
        $roots = $products->where('kind', 'combo');
        $roots->loadMissing(['comboGroups' => fn ($q) => $q->where('is_active', true)->orderBy('position')->orderBy('id'),
            'comboComponents' => fn ($q) => $q->enabledComposition()->orderBy('position')->orderBy('id'),
            'comboComponents.componentProduct' => fn ($q) => $q->with('category.parent', 'taxProfile')->withCatalogCounts(), 'comboComponents.componentVariant']);
        $leaves = new Collection($roots->flatMap(fn ($root) => $root->comboComponents->pluck('componentProduct'))->filter()->keyBy('id')->values()->all());
        app(AvailabilitySchedule::class)->decorate($leaves, $timezone, $instant);
        foreach ($roots as $root) {
            $reason = ! in_array($root->combo_allocation_mode, ['equal', 'proportional'], true) ? 'Configura el reparto de precio del combo' : null;
            $units = $root->comboComponents->whereNull('combo_group_id')->sum('units');
            foreach ($root->comboComponents as $component) {
                $leaf = $leaves->firstWhere('id', $component->component_product_id);
                if ($leaf) {
                    $component->setRelation('componentProduct', $leaf);
                }
                $partReason = $this->leafReason($leaf, $component->componentVariant);
                $component->setAttribute('selection_context', ['allowed' => $partReason === null, 'reason' => $partReason]);
                if ($component->combo_group_id === null) {
                    $reason ??= $partReason;
                }
            }
            $available = $root->comboComponents->filter(fn ($part) => $part->getAttribute('selection_context')['allowed']);
            foreach ($root->comboGroups as $group) {
                $options = $available->where('combo_group_id', $group->id);
                $reason ??= $options->count() < $group->min_select ? 'No hay suficientes alternativas disponibles en '.$group->name : null;
                $units += $options->sortBy('units')->take($group->min_select)->sum('units');
            }
            if ($units === 0) {
                $units = $available->whereNotNull('combo_group_id')->min('units') ?? 0;
            }
            $reason ??= $units < 1 || $units > 20 ? 'Configura una selección de entre 1 y 20 unidades disponibles' : null;
            $root->setAttribute('combo_context', ['ready' => $reason === null, 'reason' => $reason, 'expanded_units' => $units]);
        }
    }

    public function leafReason(?Product $product, ?ProductVariant $variant): ?string
    {
        if (! $product || $product->kind !== 'regular' || ! $product->is_active || ! $product->is_available || ! $product->category?->isEffectivelyActive()) {
            return 'Un componente ya no está disponible';
        }
        if ($product->taxProfile && ! $product->taxProfile->is_active) {
            return 'Un componente tiene su perfil tributario archivado';
        }
        if (! ($product->getAttribute('availability_context')['allowed'] ?? false)) {
            return 'Un componente está fuera de horario';
        }
        if ($product->variants_count > 0 && (! $variant || $variant->product_id != $product->id || ! $variant->is_active || ! $variant->is_available)) {
            return 'Revisa la presentación configurada de un componente';
        }
        if (! $product->variants_count && $variant) {
            return 'La presentación de un componente cambió';
        }

        return null;
    }
}
