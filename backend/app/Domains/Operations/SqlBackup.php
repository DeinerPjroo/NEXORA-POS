<?php

namespace App\Domains\Operations;

use Illuminate\Support\Facades\DB;
use RuntimeException;
use Symfony\Component\Process\Process;

final class SqlBackup
{
    public function __construct(private BackupArchive $archive) {}

    private function connection(): array
    {
        $connection = DB::connection();
        if (! in_array($connection->getDriverName(), ['mysql', 'mariadb'], true)) {
            throw new RuntimeException('El respaldo operativo requiere MySQL o MariaDB.');
        }

        return $connection->getConfig();
    }

    private function client(string $binary, array $config, array $arguments, mixed $input = null): void
    {
        $process = new Process([$binary, '--no-defaults', '--protocol=TCP', '--host='.$config['host'], '--port='.$config['port'],
            '--user='.$config['username'], '--default-character-set=utf8mb4', ...$arguments], null, ['MYSQL_PWD' => (string) $config['password']]);
        $process->setInput($input)->setTimeout(600);
        // Nunca propagar salida de clientes SQL: podría contener datos o credenciales.
        $process->disableOutput();
        if ($process->run() !== 0) {
            throw new RuntimeException('El cliente SQL no completó la operación. Comprueba versión, permisos y conectividad.');
        }
    }

    public function create(string $root, string $password, string $dumpBinary = 'mysqldump'): string
    {
        $this->archive->requireEncryption($password);
        $config = $this->connection();
        if (config('filesystems.disks.catalog.driver') !== 'local' || ! config('app.key') || ! is_dir(config('filesystems.disks.catalog.root'))) {
            throw new RuntimeException('Se requiere catálogo local y APP_KEY existente.');
        }
        // No respaldar silenciosamente tablas no transaccionales ni objetos fuera del contrato.
        $unsupported = DB::select("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND (TABLE_TYPE <> 'BASE TABLE' OR ENGINE <> 'InnoDB')", [$config['database']]);
        if ($unsupported || DB::select('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?', [$config['database']])
            || DB::select('SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?', [$config['database']])
            || DB::select('SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?', [$config['database']])) {
            throw new RuntimeException('El respaldo requiere tablas InnoDB sin vistas, triggers, rutinas ni eventos personalizados.');
        }
        $work = $this->archive->workspace($root);
        $dump = $work.DIRECTORY_SEPARATOR.'database.sql';
        $file = $work.DIRECTORY_SEPARATOR.'backup.zip';
        try {
            // Crear previamente con permisos privados antes de que el cliente escriba.
            touch($dump);
            chmod($dump, 0600);
            $this->client($dumpBinary, $config, ['--single-transaction', '--quick', '--skip-lock-tables', '--no-tablespaces', '--skip-triggers',
                '--hex-blob', '--result-file='.$dump, $config['database']]);
            $this->archive->pack($file, $dump, config('filesystems.disks.catalog.root'),
                ['key' => config('app.key'), 'previous_keys' => config('app.previous_keys', []), 'cipher' => config('app.cipher')], $password);

            return $file;
        } finally {
            if (is_file($dump)) {
                unlink($dump);
            }
        }
    }

    public function restore(string $file, string $root, string $password, string $mysqlBinary = 'mysql'): array
    {
        $this->archive->requireEncryption($password);
        $config = $this->connection();
        $directory = $this->archive->workspace($root);
        $this->archive->unpack($file, $directory, $password);
        $keys = json_decode(file_get_contents($directory.DIRECTORY_SEPARATOR.'keys.json'), true, 512, JSON_THROW_ON_ERROR);
        if (! is_string($keys['key'] ?? null) || ! in_array($keys['cipher'] ?? null, ['AES-128-CBC', 'AES-256-CBC', 'AES-128-GCM', 'AES-256-GCM'], true)) {
            throw new RuntimeException('El respaldo no contiene una clave y cifrado válidos.');
        }
        // El operador no puede elegir una base existente: CREATE sin IF NOT EXISTS.
        $database = 'nexora_restore_'.bin2hex(random_bytes(8));
        $user = 'nxr_'.bin2hex(random_bytes(8));
        $secret = bin2hex(random_bytes(32));
        $pdo = DB::connection()->getPdo();
        $account = $pdo->quote($user)."@'%'";
        DB::statement('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $createdUser = false;
        try {
            DB::statement('CREATE USER '.$account.' IDENTIFIED BY '.$pdo->quote($secret));
            $createdUser = true;
            DB::statement('GRANT ALL PRIVILEGES ON `'.addcslashes($database, '_%').'`.* TO '.$account);
            $input = fopen($directory.DIRECTORY_SEPARATOR.'database.sql', 'rb');
            try {
                // Cuenta temporal sin permisos sobre la base original, archivos del servidor ni usuarios.
                $this->client($mysqlBinary, [...$config, 'username' => $user, 'password' => $secret],
                    ['--binary-mode', '--local-infile=0', '--database='.$database], $input);
            } finally {
                fclose($input);
            }
        } finally {
            if ($createdUser) {
                DB::statement('DROP USER '.$account);
            }
        }
        file_put_contents($directory.DIRECTORY_SEPARATOR.'restore.json', json_encode(['database' => $database, 'restored_at' => gmdate(DATE_ATOM)], JSON_THROW_ON_ERROR));
        chmod($directory.DIRECTORY_SEPARATOR.'restore.json', 0600);

        return ['database' => $database, 'directory' => $directory];
    }
}
