<?php

namespace App\Domains\Catalog;

use App\Models\Branch;

final class CatalogPriceContext
{
    public function from(array $data): ?array
    {
        if (empty($data['branch_id']) || empty($data['channel'])) {
            return null;
        }
        $branch = Branch::findOrFail($data['branch_id']);
        abort_unless($branch->is_active, 409, 'La sucursal está inactiva. Elige otra para consultar el menú.');

        return ['branch' => $branch, 'channel' => $data['channel']];
    }
}
