<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Operations\BackupArchive;
use App\Domains\Operations\SqlBackup;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Tests\SqlConcurrencyTestCase;

class SqlBackupTest extends SqlConcurrencyTestCase
{
    public function test_import_account_cannot_write_into_source_database_and_is_removed_after_failure(): void
    {
        $this->requireSql();
        $source = DB::getDatabaseName();
        $root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'nexora-restore-guard-'.bin2hex(random_bytes(8));
        mkdir($root, 0700);
        mkdir($root.'/media', 0700);
        file_put_contents($root.'/source.sql', 'CREATE TABLE `'.$source.'`.forbidden_restore_write (id INT);');
        $password = bin2hex(random_bytes(32));
        app(BackupArchive::class)->pack($root.'/backup.zip', $root.'/source.sql', $root.'/media', ['key' => config('app.key'), 'cipher' => config('app.cipher')], $password);
        $binary = PHP_OS_FAMILY === 'Windows' ? 'C:/xampp/mysql/bin/mysql.exe' : 'mysql';
        try {
            app(SqlBackup::class)->restore($root.'/backup.zip', $root, $password, $binary);
            $this->fail('El importador no puede escribir en el origen.');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('cliente SQL', $error->getMessage());
        }
        $this->assertFalse(DB::getSchemaBuilder()->hasTable('forbidden_restore_write'));
        $this->assertSame($source, DB::getDatabaseName());
        $this->assertSame(0, (int) DB::table('mysql.user')->where('User', 'like', 'nxr\_%')->count());
    }

    public function test_real_sql_restore_preserves_money_tenant_fk_media_and_encrypted_credentials_without_changing_source(): void
    {
        $this->requireSql();
        PermissionCatalog::seed();
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Backup ñ', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'restore@example.test', 'password' => 'SeguraNexora123']);
        $owner->forceFill(['mfa_secret' => 'SYNTHETIC-MFA-SECRET'])->save();
        DB::statement('CREATE TABLE backup_probe (id BIGINT UNSIGNED PRIMARY KEY, tenant_id BIGINT UNSIGNED NOT NULL, amount DECIMAL(19,4) NOT NULL, CONSTRAINT backup_probe_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB');
        DB::table('backup_probe')->insert(['id' => 1, 'tenant_id' => $owner->tenant_id, 'amount' => '999999999999999.9901']);
        $root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'nexora-sql-backup-'.bin2hex(random_bytes(8));
        mkdir($root, 0700);
        mkdir($root.'/media', 0700);
        file_put_contents($root.'/media/probe.jpg', "private\x00image");
        config(['filesystems.disks.catalog.root' => $root.'/media']);
        $source = DB::getDatabaseName();
        $key = config('app.key');
        $envHash = is_file(base_path('.env')) ? hash_file('sha256', base_path('.env')) : null;
        $password = bin2hex(random_bytes(32));
        $binaryRoot = PHP_OS_FAMILY === 'Windows' ? 'C:/xampp/mysql/bin/' : '';
        $backup = app(SqlBackup::class);
        $file = $backup->create($root, $password, $binaryRoot.'mysqldump'.(PHP_OS_FAMILY === 'Windows' ? '.exe' : ''));
        $this->assertFileExists($file);
        $this->assertFileDoesNotExist(dirname($file).'/database.sql');
        $result = $backup->restore($file, $root, $password, $binaryRoot.'mysql'.(PHP_OS_FAMILY === 'Windows' ? '.exe' : ''));
        $this->assertMatchesRegularExpression('/^nexora_restore_[a-f0-9]{16}$/D', $result['database']);
        $this->assertNotSame($source, $result['database']);
        $config = DB::connection()->getConfig();
        $copy = new \PDO('mysql:host='.$config['host'].';port='.$config['port'].';dbname='.$result['database'].';charset=utf8mb4', $config['username'], $config['password'], [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
        $this->assertSame('999999999999999.9901', $copy->query('SELECT amount FROM backup_probe')->fetchColumn());
        $this->assertSame((string) $owner->tenant_id, (string) $copy->query('SELECT tenant_id FROM backup_probe')->fetchColumn());
        $this->assertSame('Backup ñ', $copy->query('SELECT name FROM tenants')->fetchColumn());
        $keys = json_decode(file_get_contents($result['directory'].'/keys.json'), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame($key, $keys['key']);
        $encrypter = new Encrypter(base64_decode(substr($keys['key'], 7)), $keys['cipher']);
        $this->assertSame('SYNTHETIC-MFA-SECRET', $encrypter->decryptString($copy->query('SELECT mfa_secret FROM users')->fetchColumn()));
        $this->assertSame("private\x00image", file_get_contents($result['directory'].'/catalog/probe.jpg'));
        $this->assertSame($source, DB::getDatabaseName());
        $this->assertSame('999999999999999.9901', DB::table('backup_probe')->value('amount'));
        $this->assertSame($key, config('app.key'));
        $this->assertSame($envHash, is_file(base_path('.env')) ? hash_file('sha256', base_path('.env')) : null);
        $this->assertSame(0, (int) DB::table('mysql.user')->where('User', 'like', 'nxr\_%')->count());
        try {
            $copy->exec('INSERT INTO backup_probe VALUES (2,999999,1)');
            $this->fail('La FK restaurada debe seguir protegiendo pertenencia.');
        } catch (\PDOException $error) {
            $this->assertSame('23000', $error->getCode());
        }
        fwrite(STDERR, 'Copia SQL conservada: '.$result['database'].PHP_EOL);
    }
}
