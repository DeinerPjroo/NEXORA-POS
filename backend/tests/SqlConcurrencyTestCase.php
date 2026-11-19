<?php

namespace Tests;

use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

abstract class SqlConcurrencyTestCase extends TestCase
{
    use DatabaseTruncation;

    protected function beforeTruncatingDatabase(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            $this->beforeApplicationDestroyed(function () {
                $name = DB::getDatabaseName();
                if (! preg_match('/^nexora_test_[a-f0-9]{16}$/D', $name) || getenv('NEXORA_ISOLATED_DATABASE') !== $name) {
                    throw new \LogicException('La limpieza exige el esquema SQL aislado.');
                }
                $this->truncateTablesForAllConnections();
            });

            return;
        }
        RefreshDatabaseState::$migrated = false;
        $this->beforeApplicationDestroyed(fn () => RefreshDatabaseState::$migrated = false);
    }

    protected function requireSql(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            $this->markTestSkipped('Requiere conexiones SQL reales mediante scripts/test-mysql.php.');
        }
    }

    protected function race(array $inputs): array
    {
        $runtime = base_path('../.runtime');
        if (! is_dir($runtime)) {
            mkdir($runtime, 0700, true);
        }
        $barrier = realpath($runtime).DIRECTORY_SEPARATOR.'sql-race-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        $workers = [];
        try {
            foreach ($inputs as $index => $input) {
                $worker = new Process([PHP_BINARY, base_path('../scripts/test-sql-worker.php')], base_path(), ['NEXORA_SQL_TEST_WORKER' => '1',
                    'NEXORA_SQL_BARRIER' => $barrier, 'NEXORA_SQL_PARTICIPANT' => (string) $index]);
                $worker->setInput(json_encode($input, JSON_THROW_ON_ERROR))->setTimeout(30)->start();
                $workers[] = $worker;
            }
            $deadline = microtime(true) + 10;
            while (count(glob($barrier.DIRECTORY_SEPARATOR.'ready-*')) !== count($workers)) {
                if (microtime(true) >= $deadline) {
                    throw new \RuntimeException('Los procesos no llegaron a la barrera de prueba.');
                }
                usleep(10000);
            }
            file_put_contents($barrier.DIRECTORY_SEPARATOR.'go', '1');
            $results = [];
            foreach ($workers as $worker) {
                $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                $results[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR);
            }

            return $results;
        } finally {
            foreach ($workers as $worker) {
                if ($worker->isRunning()) {
                    $worker->stop();
                }
            }
            foreach (array_merge(array_map(fn ($index) => 'ready-'.$index, array_keys($inputs)), ['go']) as $file) {
                $path = $barrier.DIRECTORY_SEPARATOR.$file;
                if (is_file($path)) {
                    unlink($path);
                }
            }
            rmdir($barrier);
        }
    }
}
