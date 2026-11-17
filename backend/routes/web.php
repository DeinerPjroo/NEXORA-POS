<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['product' => 'Nexora POS', 'api' => '/api/v1', 'frontend' => config('nexora.frontend_url')]);
});
