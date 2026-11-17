<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

final class EnvironmentDoctor extends Command
{
    protected $signature = 'nexora:doctor';

    protected $description = 'Comprueba PHP y la base configurada sin modificarla ni mostrar secretos';

    public function handle(): int
    {
        $this->info('Nexora POS · Diagnóstico local');
        $this->line('PHP: '.PHP_VERSION);
        $this->line('Motor configurado: '.config('database.default'));
        foreach (['pdo', 'mbstring', 'openssl', 'fileinfo', 'gd'] as $extension) {
            if (! extension_loaded($extension)) {
                $this->error('Falta la extensión PHP: '.$extension);

                return self::FAILURE;
            }
        }
        $imageSupport = gd_info();
        if (empty($imageSupport['JPEG Support']) || empty($imageSupport['PNG Support']) || empty($imageSupport['WebP Support'])) {
            $this->error('GD necesita soporte JPEG, PNG y WebP para el catálogo.');

            return self::FAILURE;
        }
        try {
            $connection = DB::connection();
            $connection->select('SELECT 1');
            $this->info('Conexión a la base de datos: correcta.');
            $this->line('Versión del motor: '.$connection->getServerVersion());
            if (! $connection->getSchemaBuilder()->hasTable('tenants')) {
                $this->warn('La base responde, pero faltan las tablas de Nexora. Ejecuta php artisan migrate --seed.');
            }

            return self::SUCCESS;
        } catch (Throwable) {
            $this->error('No se pudo conectar a la base configurada. Revisa servicio, base, host, puerto y credenciales en .env.');

            return self::FAILURE;
        }
    }
}
