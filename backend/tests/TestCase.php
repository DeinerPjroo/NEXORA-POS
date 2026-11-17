<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public function createApplication(): Application
    {
        $app = parent::createApplication();
        $driver = config('database.default');
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $name = config('database.connections.'.$driver.'.database');
            if (! is_string($name) || ! preg_match('/^nexora_test_[a-f0-9]{16}$/D', $name) || getenv('NEXORA_ISOLATED_DATABASE') !== $name) {
                throw new \LogicException('Las pruebas SQL solo pueden ejecutarse mediante scripts/test-mysql.php en su base temporal.');
            }
        }

        return $app;
    }
}
