<?php

// Genera DDL MySQL desde las migraciones SIN conectar a ningún servidor.
require __DIR__.'/../backend/vendor/autoload.php';
$app = require __DIR__.'/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Database\MySqlConnection;
use Illuminate\Support\Facades\DB;

DB::extend('nexora_schema_export', function () {
    return new class(fn () => throw new LogicException('El exportador nunca debe abrir una conexión.'), 'nexora_pos', '', [
        'driver' => 'mysql', 'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'prefix_indexes' => true,
    ]) extends MySqlConnection {
        public function getServerVersion(): string { return '8.0.36'; }
        public function isMaria(): bool { return false; }
    };
});
config(['database.connections.schema_export' => ['driver' => 'nexora_schema_export']]);
DB::setDefaultConnection('schema_export');
$queries = DB::connection()->pretend(function () {
    foreach (glob(__DIR__.'/../backend/database/migrations/*.php') as $path) {
        (require $path)->up();
    }
});
$sql = "-- Nexora POS: DDL de modelado para MySQL Workbench; generado desde las migraciones.\n";
$sql .= "-- Runtime: instalar con php artisan migrate --seed, no importar este archivo en una base operativa.\n\n";
foreach ($queries as $query) {
    // Los datos de migraciones (permisos) no forman parte del modelo EER.
    if (!preg_match('/^(create|alter|drop|rename)\b/i', $query['query'])) continue;
    if ($query['bindings']) throw new LogicException('DDL inesperado con parámetros.');
    $sql .= $query['query'].";\n\n";
}
$target = __DIR__.'/../docs/database/initial-schema.mysql.sql';
if (!is_dir(dirname($target))) mkdir(dirname($target), 0777, true);
file_put_contents($target, $sql);
echo 'Esquema generado: docs/database/initial-schema.mysql.sql'.PHP_EOL;
