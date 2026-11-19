<?php

namespace Tests\Feature;

use App\Domains\Operations\BackupArchive;
use Tests\TestCase;
use ZipArchive;

class BackupArchiveTest extends TestCase
{
    private function root(): string
    {
        $root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'nexora-backup-test-'.bin2hex(random_bytes(8));
        mkdir($root, 0700);

        return $root;
    }

    public function test_encrypted_archive_roundtrip_preserves_private_bytes_and_keys(): void
    {
        $archive = app(BackupArchive::class);
        $root = $this->root();
        mkdir($root.'/media', 0700);
        file_put_contents($root.'/source.sql', "INSERT INTO probe VALUES ('á',100.0100);\n");
        $bytes = random_bytes(80)."\x00\xff";
        file_put_contents($root.'/media/probe.jpg', $bytes);
        $password = bin2hex(random_bytes(32));
        $archive->pack($root.'/backup.zip', $root.'/source.sql', $root.'/media', ['key' => 'synthetic-test-key'], $password);
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($root.'/backup.zip') === true);
        $this->assertFalse($zip->getFromName('keys.json'));
        for ($index = 0; $index < $zip->numFiles; $index++) {
            $this->assertSame(ZipArchive::EM_AES_256, $zip->statIndex($index)['encryption_method']);
        }
        $zip->close();
        $target = $archive->workspace($root);
        $archive->unpack($root.'/backup.zip', $target, $password);
        $this->assertSame(file_get_contents($root.'/source.sql'), file_get_contents($target.'/database.sql'));
        $this->assertSame($bytes, file_get_contents($target.'/catalog/probe.jpg'));
        $this->assertSame(['key' => 'synthetic-test-key'], json_decode(file_get_contents($target.'/keys.json'), true));
    }

    public function test_wrong_password_cannot_create_plaintext_and_short_password_is_rejected(): void
    {
        $archive = app(BackupArchive::class);
        $root = $this->root();
        file_put_contents($root.'/source.sql', 'SELECT 1;');
        $archive->pack($root.'/backup.zip', $root.'/source.sql', $root, [], str_repeat('a', 32));
        $target = $archive->workspace($root);
        try {
            $archive->unpack($root.'/backup.zip', $target, str_repeat('b', 32));
            $this->fail('Una contraseña incorrecta no puede extraer datos.');
        } catch (\RuntimeException) {
            $this->assertSame([], array_diff(scandir($target), ['.', '..']));
        }
        $this->expectException(\RuntimeException::class);
        $archive->pack($root.'/weak.zip', $root.'/source.sql', $root, [], 'weak');
    }

    public function test_unencrypted_or_traversal_entries_and_manifest_tampering_are_rejected(): void
    {
        $root = $this->root();
        $archive = app(BackupArchive::class);
        $password = str_repeat('x', 32);
        foreach (['../escape.txt', 'catalog/../../escape.txt', 'keys.json', 'database.sql'] as $index => $name) {
            $path = $root.'/unsafe-'.$index.'.zip';
            $zip = new ZipArchive;
            $zip->open($path, ZipArchive::CREATE | ZipArchive::EXCL);
            $zip->addFromString($name, 'sensitive');
            $zip->close();
            $target = $archive->workspace($root);
            try {
                $archive->unpack($path, $target, $password);
                $this->fail('Entrada peligrosa aceptada.');
            } catch (\RuntimeException) {
                $this->assertSame([], array_diff(scandir($target), ['.', '..']));
            }
        }
        $zip = new ZipArchive;
        $zip->open($root.'/tampered.zip', ZipArchive::CREATE | ZipArchive::EXCL);
        foreach (['database.sql' => 'changed', 'keys.json' => '{}', 'manifest.json' => json_encode(['format' => 1, 'files' => ['database.sql' => hash('sha256', 'original'), 'keys.json' => hash('sha256', '{}')]])] as $name => $content) {
            $zip->addFromString($name, $content);
            $zip->setEncryptionName($name, ZipArchive::EM_AES_256, $password);
        }
        $zip->close();
        $this->expectException(\RuntimeException::class);
        $archive->unpack($root.'/tampered.zip', $archive->workspace($root), $password);
    }

    public function test_worktree_backup_destination_and_unattended_commands_are_rejected(): void
    {
        $this->artisan('nexora:backup', ['directory' => base_path(), '--drained' => true, '--no-interaction' => true])->assertFailed();
        $this->artisan('nexora:restore', ['archive' => 'missing.zip', 'directory' => base_path(), '--no-interaction' => true])->assertFailed();
        $this->expectException(\RuntimeException::class);
        app(BackupArchive::class)->privateRoot(base_path());
    }
}
