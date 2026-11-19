<?php

namespace App\Console\Commands;

use App\Domains\Operations\SqlBackup;
use Illuminate\Console\Command;

final class BackupCreate extends Command
{
    protected $signature = 'nexora:backup {directory : Directorio privado existente, fuera de la raíz web} {--drained : Confirma aplicación en mantenimiento, workers detenidos y peticiones finalizadas} {--dump=mysqldump : Ruta del cliente compatible con el servidor}';

    protected $description = 'Respalda SQL, catálogo privado y claves en ZIP AES-256 sin modificar datos';

    public function handle(SqlBackup $backup): int
    {
        if (! app()->isDownForMaintenance() || ! $this->option('drained') || ! $this->input->isInteractive()) {
            $this->error('Requiere mantenimiento, peticiones drenadas, workers detenidos, --drained y terminal interactiva.');

            return self::FAILURE;
        }
        $password = $this->secret('Contraseña del respaldo (mínimo 32 caracteres; guardar separada)');
        if (! is_string($password) || $password !== $this->secret('Repite la contraseña')) {
            $this->error('Las contraseñas no coinciden.');

            return self::FAILURE;
        }
        try {
            $this->info($backup->create($this->argument('directory'), $password, $this->option('dump')));

            return self::SUCCESS;
        } catch (\Throwable $error) {
            $this->error('Respaldo incompleto ('.class_basename($error).'). No se modificó la base de datos.');

            return self::FAILURE;
        }
    }
}
