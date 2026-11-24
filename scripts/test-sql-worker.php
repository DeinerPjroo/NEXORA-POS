<?php

// Worker de concurrencia SQL: jamás permite la base de trabajo ni imprime credenciales.
$database = getenv('DB_DATABASE');
if (PHP_SAPI !== 'cli' || getenv('NEXORA_SQL_TEST_WORKER') !== '1' || ! is_string($database)
    || ! preg_match('/^nexora_test_[a-f0-9]{16}$/D', $database) || getenv('NEXORA_ISOLATED_DATABASE') !== $database
    || ! in_array(getenv('DB_CONNECTION'), ['mysql', 'mariadb'], true) || getenv('DB_URL')) {
    fwrite(STDERR, "Worker rechazado: exige esquema SQL aislado y marca explícita.\n");
    exit(2);
}
require __DIR__.'/../backend/vendor/autoload.php';
$app = require __DIR__.'/../backend/bootstrap/app.php';
if ($app->configurationIsCached()) {
    exit(2);
}
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! in_array(config('database.default'), ['mysql', 'mariadb'], true)
    || config('database.connections.'.config('database.default').'.database') !== $database
    || config('database.connections.'.config('database.default').'.url')) {
    exit(2);
}
try {
    $barrier = realpath((string) getenv('NEXORA_SQL_BARRIER'));
    $runtime = realpath(__DIR__.'/../.runtime');
    $participant = getenv('NEXORA_SQL_PARTICIPANT');
    if (! $barrier || ! $runtime || dirname($barrier) !== $runtime || ! preg_match('/^sql-race-[a-f0-9]{16}$/D', basename($barrier))
        || ! is_string($participant) || ! preg_match('/^[0-9]{1,2}$/D', $participant)) {
        throw new LogicException('La barrera de prueba no es válida.');
    }
    file_put_contents($barrier.DIRECTORY_SEPARATOR.'ready-'.$participant, '1');
    $deadline = microtime(true) + 10;
    while (! is_file($barrier.DIRECTORY_SEPARATOR.'go')) {
        if (microtime(true) >= $deadline) {
            throw new RuntimeException('La barrera de prueba venció.');
        }
        usleep(10000);
    }
    $input = json_decode(stream_get_contents(STDIN, 4096), true, 512, JSON_THROW_ON_ERROR);
    $operation = $input['operation'] ?? 'mfa.challenge';
    if ($operation === 'mfa.challenge') {
        $user = app(App\Domains\Identity\MultiFactor::class)->challenge($input['pending'], $input['data']);
        $result = ['accepted' => $user !== null, 'status' => $user ? 200 : 422];
    } else {
        $actor = App\Models\User::findOrFail($input['actor_id']);
        $result = app(App\Domains\Tenancy\TenantContext::class)->run($actor->tenant_id, function () use ($input, $operation, $actor) {
            Illuminate\Support\Facades\Auth::guard('web')->setUser($actor);
            $resource = $input['resource_id'];
            $data = $input['data'];
            $model = match ($operation) {
                'sale.collect' => app(App\Domains\Sales\CollectCash::class)->execute($actor, App\Models\Order::findOrFail($resource), $data),
                'sale.payments' => app(App\Domains\Sales\AddPayments::class)->execute($actor, App\Models\Sale::findOrFail($resource), $data),
                'sale.refunds' => app(App\Domains\Sales\PartialRefund::class)->execute($actor, App\Models\Sale::findOrFail($resource), $data),
                'cash.open' => app(App\Domains\Cash\CashOperations::class)->open($actor, App\Models\CashRegister::findOrFail($resource), $data),
                'order.append' => app(App\Domains\Orders\CreateOrder::class)->execute($actor, $data),
                'order.item.change' => app(App\Domains\Orders\ChangeDeliveryItem::class)->execute($actor, App\Models\Order::findOrFail($resource), $data),
                'studio.save' => app(App\Domains\Studio\SavePosLayout::class)->execute($actor, $data),
                'studio.publish' => app(App\Domains\Studio\SavePosLayout::class)->execute($actor, $data, true),
                'studio.restore' => app(App\Domains\Studio\ChangeStudioVersion::class)->execute($actor, $data),
                default => throw new LogicException('Operación de prueba no permitida.'),
            };

            return ['accepted' => true, 'status' => 200, 'id' => $model->id];
        });
    }
    echo json_encode($result, JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Illuminate\Validation\ValidationException $failure) {
    echo json_encode(['accepted' => false, 'status' => 422], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Illuminate\Auth\Access\AuthorizationException $failure) {
    echo json_encode(['accepted' => false, 'status' => $failure->status() ?? 403], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Illuminate\Database\Eloquent\ModelNotFoundException $failure) {
    echo json_encode(['accepted' => false, 'status' => 404], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $failure) {
    echo json_encode(['accepted' => false, 'status' => $failure->getStatusCode()], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $failure) {
    fwrite(STDERR, get_class($failure).PHP_EOL);
    exit(1);
}
