<?php

// Worker de concurrencia SQL: jamás permite la base de trabajo ni imprime credenciales.
$database = getenv('DB_DATABASE');
if (PHP_SAPI !== 'cli' || getenv('NEXORA_MFA_TEST_WORKER') !== '1' || ! is_string($database)
    || ! preg_match('/^nexora_test_[a-f0-9]{16}$/D', $database) || getenv('NEXORA_ISOLATED_DATABASE') !== $database
    || ! in_array(getenv('DB_CONNECTION'), ['mysql', 'mariadb'], true) || getenv('DB_URL')) {
    fwrite(STDERR, "Worker rechazado: exige esquema SQL aislado y marca explícita.\n");
    exit(2);
}
require __DIR__.'/../backend/vendor/autoload.php';
$app = require __DIR__.'/../backend/bootstrap/app.php';
if ($app->configurationIsCached()) {
    exit(2);
}
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! in_array(config('database.default'), ['mysql', 'mariadb'], true)
    || config('database.connections.'.config('database.default').'.database') !== $database
    || config('database.connections.'.config('database.default').'.url')) {
    exit(2);
}
try {
    $input = json_decode(stream_get_contents(STDIN, 4096), true, 512, JSON_THROW_ON_ERROR);
    $user = app(App\Domains\Identity\MultiFactor::class)->challenge($input['pending'], $input['data']);
    echo json_encode(['accepted' => $user !== null], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $failure) {
    fwrite(STDERR, get_class($failure).PHP_EOL);
    exit(1);
}
