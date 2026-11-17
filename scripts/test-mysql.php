<?php

// Usa las credenciales locales sin imprimirlas y prueba SOLO una base nueva de nombre aleatorio.
require __DIR__.'/../backend/vendor/autoload.php';
$app = require __DIR__.'/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

$driver = config('database.default');
if (!in_array($driver, ['mysql', 'mariadb'], true)) {
    fwrite(STDERR, "Configura MySQL o MariaDB en backend/.env antes de esta prueba.\n");
    exit(1);
}
if (app()->configurationIsCached()) {
    fwrite(STDERR, "Ejecuta php artisan config:clear antes de probar para aislar la conexión.\n");
    exit(1);
}
$connection = DB::connection();
$config = $connection->getConfig();
$database = 'nexora_test_'.bin2hex(random_bytes(8));
$created = false;
$status = 1;
try {
    // CREATE sin IF NOT EXISTS: jamás reutilizar ni limpiar una base anterior.
    $connection->statement('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $created = true;
    echo 'Pruebas aisladas en '.$database.PHP_EOL;
    $process = new Process([PHP_BINARY, 'vendor/bin/phpunit', '--testdox'], __DIR__.'/../backend', [
        'APP_ENV' => 'testing', 'DB_CONNECTION' => $driver, 'DB_URL' => '',
        'DB_HOST' => (string) $config['host'], 'DB_PORT' => (string) $config['port'],
        'DB_USERNAME' => (string) $config['username'], 'DB_PASSWORD' => (string) $config['password'],
        'DB_DATABASE' => $database, 'SESSION_DRIVER' => 'array', 'CACHE_STORE' => 'array',
        'NEXORA_ISOLATED_DATABASE' => $database,
        'MAIL_MAILER' => 'array', 'BCRYPT_ROUNDS' => '4',
    ]);
    $process->setTimeout(180);
    $status = $process->run(fn ($type, $output) => print($output));
} catch (Throwable $error) {
    fwrite(STDERR, "No se completó la prueba. Verifica conexión y permiso para crear una base temporal.\n");
    fwrite(STDERR, 'Diagnóstico: '.get_class($error).' (código '.$error->getCode().')'.PHP_EOL);
} finally {
    // Solo elimina la base que este proceso acaba de crear con éxito.
    if ($created && preg_match('/^nexora_test_[a-f0-9]{16}$/D', $database)) {
        try {
            $connection->statement('DROP DATABASE `'.$database.'`');
            echo 'Base temporal eliminada. La base de Nexora no se modificó.'.PHP_EOL;
        } catch (Throwable) {
            fwrite(STDERR, 'No se pudo limpiar la base temporal: '.$database.PHP_EOL);
            $status = 1;
        }
    }
}
exit($status);
