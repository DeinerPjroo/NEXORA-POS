<?php

namespace App\Domains\Operations;

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use ZipArchive;

final class BackupArchive
{
    public function privateRoot(string $directory): string
    {
        $root = realpath($directory);
        if (! $root || ! is_dir($root) || ! is_writable($root)) {
            throw new RuntimeException('El directorio privado debe existir y permitir escritura.');
        }
        $forbidden = [realpath(base_path('..')), realpath(public_path()), $_SERVER['DOCUMENT_ROOT'] ?? null];
        // XAMPP publica htdocs completo; rechazar también sus otros proyectos.
        $projectParent = dirname(base_path(), 2);
        if (strtolower(basename($projectParent)) === 'htdocs') {
            $forbidden[] = $projectParent;
        }
        foreach (array_filter($forbidden) as $path) {
            $normalized = strtolower(str_replace('\\', '/', $root)).'/';
            if (str_starts_with($normalized, rtrim(strtolower(str_replace('\\', '/', $path)), '/').'/')) {
                throw new RuntimeException('El respaldo debe quedar fuera del proyecto y de la raíz web.');
            }
        }

        return $root;
    }

    public function workspace(string $root): string
    {
        $directory = $this->privateRoot($root).DIRECTORY_SEPARATOR.'nexora-'.bin2hex(random_bytes(8));
        if (! mkdir($directory, 0700)) {
            throw new RuntimeException('No se pudo crear un destino nuevo.');
        }

        return $directory;
    }

    public function requireEncryption(#[\SensitiveParameter] string $password): void
    {
        if (strlen($password) < 32 || ! class_exists(ZipArchive::class)
            || ! ZipArchive::isEncryptionMethodSupported(ZipArchive::EM_AES_256)) {
            throw new RuntimeException('Se requiere ZIP con AES-256 y contraseña de al menos 32 caracteres.');
        }
    }

    private function open(string $file, #[\SensitiveParameter] string $password, int $flags): ZipArchive
    {
        $this->requireEncryption($password);
        $zip = new ZipArchive;
        if ($zip->open($file, $flags) !== true || ! $zip->setPassword($password)) {
            throw new RuntimeException('No se pudo abrir el respaldo.');
        }

        return $zip;
    }

    public function pack(string $file, string $dump, string $mediaRoot, #[\SensitiveParameter] array $keys, #[\SensitiveParameter] string $password): void
    {
        $zip = $this->open($file, $password, ZipArchive::CREATE | ZipArchive::EXCL);
        $manifest = ['format' => 1, 'created_at' => gmdate(DATE_ATOM), 'files' => []];
        try {
            $zip->addFile($dump, 'database.sql');
            $manifest['files']['database.sql'] = hash_file('sha256', $dump);
            $json = json_encode($keys, JSON_THROW_ON_ERROR);
            $zip->addFromString('keys.json', $json);
            $manifest['files']['keys.json'] = hash('sha256', $json);
            if (is_dir($mediaRoot)) {
                $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($mediaRoot, \FilesystemIterator::SKIP_DOTS));
                foreach ($iterator as $entry) {
                    if ($entry->isLink() || ! $entry->isFile()) {
                        throw new RuntimeException('El catálogo no debe contener enlaces ni archivos especiales.');
                    }
                    $name = 'catalog/'.str_replace('\\', '/', substr($entry->getPathname(), strlen(rtrim($mediaRoot, '/\\')) + 1));
                    $this->safeName($name);
                    $zip->addFile($entry->getPathname(), $name);
                    $manifest['files'][$name] = hash_file('sha256', $entry->getPathname());
                }
            }
            $zip->addFromString('manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR));
            foreach (array_merge(array_keys($manifest['files']), ['manifest.json']) as $name) {
                if (! $zip->setEncryptionName($name, ZipArchive::EM_AES_256, $password)) {
                    throw new RuntimeException('No se pudo cifrar una entrada.');
                }
            }
        } catch (\Throwable $error) {
            $zip->close();
            @unlink($file);
            throw $error;
        }
        if (! $zip->close()) {
            @unlink($file);
            throw new RuntimeException('No se pudo completar el respaldo cifrado.');
        }
        chmod($file, 0600);
    }

    private function safeName(string $name): void
    {
        if (! preg_match('/\A(?:database\.sql|keys\.json|manifest\.json|catalog\/[A-Za-z0-9_.\/-]+)\z/', $name)
            || preg_match('~(?:^|/)[.]{1,2}(?:/|$)|//~', $name) || str_ends_with($name, '/')) {
            throw new RuntimeException('Nombre de archivo no permitido en el respaldo.');
        }
    }

    public function unpack(string $file, string $directory, #[\SensitiveParameter] string $password): array
    {
        $zip = $this->open($file, $password, ZipArchive::RDONLY);
        try {
            if ($zip->numFiles > 100000) {
                throw new RuntimeException('Demasiados archivos en el respaldo.');
            }
            $names = [];
            $size = 0;
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $entry = $zip->statIndex($index);
                $this->safeName($entry['name']);
                $key = strtolower($entry['name']);
                if (isset($names[$key]) || ($entry['encryption_method'] ?? null) !== ZipArchive::EM_AES_256) {
                    throw new RuntimeException('Entrada duplicada o sin cifrado AES-256.');
                }
                $names[$key] = true;
                $size += $entry['size'];
            }
            if ($size > 100 * 1024 ** 3 || ($zip->statName('manifest.json')['size'] ?? PHP_INT_MAX) > 8 * 1024 ** 2) {
                throw new RuntimeException('El respaldo supera los límites de tamaño.');
            }
            $raw = $zip->getFromName('manifest.json');
            if ($raw === false) {
                throw new RuntimeException('Contraseña o respaldo incorrectos.');
            }
            $manifest = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            if (($manifest['format'] ?? null) !== 1 || ! isset($manifest['files']['database.sql'], $manifest['files']['keys.json'])
                || count($manifest['files']) + 1 !== count($names)) {
                throw new RuntimeException('Manifest incompleto.');
            }
            foreach ($manifest['files'] as $name => $hash) {
                $this->safeName($name);
                if ($name === 'manifest.json' || ! isset($names[strtolower($name)]) || ! is_string($hash) || ! preg_match('/^[a-f0-9]{64}$/D', $hash)) {
                    throw new RuntimeException('Manifest no válido.');
                }
                $target = $directory.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $name);
                if (! is_dir(dirname($target))) {
                    mkdir(dirname($target), 0700, true);
                }
                $source = $zip->getStream($name);
                $output = fopen($target, 'xb');
                if (! $source || ! $output) {
                    throw new RuntimeException('No se pudo leer o crear un archivo.');
                }
                try {
                    $copied = stream_copy_to_stream($source, $output);
                } finally {
                    fclose($source);
                    fclose($output);
                    chmod($target, 0600);
                }
                if ($copied === false || ! hash_equals($hash, hash_file('sha256', $target))) {
                    throw new RuntimeException('Integridad del respaldo incorrecta.');
                }
            }

            return $manifest;
        } finally {
            $zip->close();
        }
    }
}
