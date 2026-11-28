<?php

use App\Domains\Cash\CashOperations;
use App\Domains\Identity\MultiFactor;
use App\Domains\Orders\ChangeDeliveryItem;
use App\Domains\Orders\CourierCollections;
use App\Domains\Orders\CreateOrder;
use App\Domains\Orders\TransferCourierCash;
use App\Domains\Sales\AddPayments;
use App\Domains\Sales\CollectCash;
use App\Domains\Sales\PartialRefund;
use App\Domains\Studio\ChangeStudioVersion;
use App\Domains\Studio\SavePosLayout;
use App\Domains\Tenancy\TenantContext;
use App\Models\CashRegister;
use App\Models\CourierCollection;
use App\Models\Order;
use App\Models\OrderDelivery;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

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
$app->make(Kernel::class)->bootstrap();
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
        $user = app(MultiFactor::class)->challenge($input['pending'], $input['data']);
        $result = ['accepted' => $user !== null, 'status' => $user ? 200 : 422];
    } else {
        $actor = User::findOrFail($input['actor_id']);
        $result = app(TenantContext::class)->run($actor->tenant_id, function () use ($input, $operation, $actor) {
            Auth::guard('web')->setUser($actor);
            $resource = $input['resource_id'];
            $data = $input['data'];
            $model = match ($operation) {
                'sale.collect' => app(CollectCash::class)->execute($actor, Order::findOrFail($resource), $data),
                'sale.payments' => app(AddPayments::class)->execute($actor, Sale::findOrFail($resource), $data),
                'sale.refunds' => app(PartialRefund::class)->execute($actor, Sale::findOrFail($resource), $data),
                'cash.open' => app(CashOperations::class)->open($actor, CashRegister::findOrFail($resource), $data),
                'courier.cash' => app(TransferCourierCash::class)->execute($actor, (int) $resource, $data),
                'courier.collect' => app(CollectCash::class)->execute($actor, Order::findOrFail(OrderDelivery::findOrFail($resource)->order_id), [...$data, 'discount_amount' => '0'], (int) $resource),
                'courier.settle' => app(CourierCollections::class)->settle($actor, CourierCollection::findOrFail($resource), $data),
                'courier.refund' => app(PartialRefund::class)->execute($actor, CourierCollection::findOrFail($resource)->sale, $data, (int) $resource),
                'order.append' => app(CreateOrder::class)->execute($actor, $data),
                'order.item.change' => app(ChangeDeliveryItem::class)->execute($actor, Order::findOrFail($resource), $data),
                'studio.save' => app(SavePosLayout::class)->execute($actor, $data),
                'studio.publish' => app(SavePosLayout::class)->execute($actor, $data, true),
                'studio.restore' => app(ChangeStudioVersion::class)->execute($actor, $data),
                default => throw new LogicException('Operación de prueba no permitida.'),
            };

            return ['accepted' => true, 'status' => 200, 'id' => $model->id];
        });
    }
    echo json_encode($result, JSON_THROW_ON_ERROR).PHP_EOL;
} catch (ValidationException $failure) {
    echo json_encode(['accepted' => false, 'status' => 422], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (AuthorizationException $failure) {
    echo json_encode(['accepted' => false, 'status' => $failure->status() ?? 403], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (ModelNotFoundException $failure) {
    echo json_encode(['accepted' => false, 'status' => 404], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (HttpExceptionInterface $failure) {
    echo json_encode(['accepted' => false, 'status' => $failure->getStatusCode()], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $failure) {
    fwrite(STDERR, get_class($failure).PHP_EOL);
    exit(1);
}
