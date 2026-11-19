<?php

namespace App\Domains\Catalog;

use App\Models\Product;
use App\Models\User;
use Illuminate\Http\UploadedFile;

final class SaveProductImage
{
    public function execute(Product $product, User $actor, int $revision, ?UploadedFile $file): Product
    {
        return app(ProductGallery::class)->legacy($product, $actor, $revision, $file);
    }
}
