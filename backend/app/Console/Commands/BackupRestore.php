<?php

namespace App\Console\Commands;

use App\Domains\Operations\SqlBackup;
use Illuminate\Console\Command;

final class BackupRestore extends Command
{
    protected $signature = 'nexora:restore {archive : Respaldo ZIP propio y confiable} {directory : Directorio privado existente} {--client=mysql : Ruta del cliente compatible con el servidor}';

    protected $description = 'Restaura en esquema y directorio nuevos, sin modificar la configuración ni bases existentes';

    public function handle(SqlBackup $backup): int
    {
        if (! $this->input->isInteractive()) {
            $this->error('Requiere terminal interactiva para la contraseña privada.');

            return self::FAILURE;
        }
        $password = $this->secret('Contraseña del respaldo');
        try {
            $result = $backup->restore($this->argument('archive'), $this->argument('directory'), (string) $password, $this->option('client'));
            $this->info('Restauración creada: '.$result['database']);
            $this->line('Directorio privado: '.$result['directory']);
            $this->line('La aplicación conserva su base y clave actuales. Valida la copia antes de cualquier cambio de entorno.');

            return self::SUCCESS;
        } catch (\Throwable $error) {
            $this->error('Restauración incompleta ('.class_basename($error).'). Se conservan destinos nuevos para diagnóstico privado. No se eliminó ninguna base.');

            return self::FAILURE;
        }
    }
}
