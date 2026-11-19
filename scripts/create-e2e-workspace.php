<?php

// Solo prepara datos ficticios en la base dedicada; no publica un endpoint ni cambia límites.
if (PHP_SAPI !== 'cli' || getenv('NEXORA_E2E_FIXTURE') !== '1') {
    fwrite(STDERR, "Este script exige el contexto explícito de fixtures E2E.\n");
    exit(1);
}
$backend = realpath(__DIR__.'/../backend');
$expected = realpath($backend.'/database/e2e.sqlite');
$actual = realpath((string) getenv('DB_DATABASE'));
if (! $expected || ! $actual || strcasecmp(dirname($expected), (string) realpath($backend.'/database')) !== 0 || basename($expected) !== 'e2e.sqlite' || strcasecmp($expected, $actual) !== 0 || getenv('DB_CONNECTION') !== 'sqlite' || getenv('DB_URL')) {
    fwrite(STDERR, "Fixture rechazado: solo se permite backend/database/e2e.sqlite con driver SQLite.\n");
    exit(1);
}
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
if ($app->configurationIsCached()) {
    fwrite(STDERR, "Fixture rechazado: no se permite configuración en caché.\n");
    exit(1);
}
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if ($app->configurationIsCached() || config('database.default') !== 'sqlite' || strcasecmp((string) realpath(config('database.connections.sqlite.database')), $expected) !== 0 || config('database.connections.sqlite.url')) {
    fwrite(STDERR, "Fixture rechazado: la configuración efectiva no es la base aislada esperada.\n");
    exit(1);
}
try {
    $input = json_decode(stream_get_contents(STDIN, 4096), true, 512, JSON_THROW_ON_ERROR);
    $data = Illuminate\Support\Facades\Validator::make($input, ['company_name' => ['required', 'string', 'max:120'], 'email' => ['required', 'email', 'ends_with:@example.test'], 'password' => ['required', 'string', 'min:20', 'max:72'], 'email_verified' => ['sometimes', 'boolean'], 'permissions' => ['sometimes', 'array', 'list', 'max:28'], 'permissions.*' => ['string', 'distinct', Illuminate\Validation\Rule::in(array_keys(App\Domains\Identity\PermissionCatalog::ALL))]])->validate();
    $permissions = $data['permissions'] ?? null;
    $emailVerified = $data['email_verified'] ?? false;
    unset($data['permissions'], $data['email_verified']);
    $user = app(App\Domains\Identity\RegisterCompany::class)->execute([...$data, 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana Pérez']);
    if ($emailVerified) {
        $user->markEmailAsVerified();
    }
    if ($permissions !== null) {
        app(App\Domains\Tenancy\TenantContext::class)->run($user->tenant_id, function () use ($permissions, $user) {
            Illuminate\Support\Facades\DB::transaction(function () use ($permissions, $user) {
                $role = App\Models\Role::create(['name' => 'Operador de prueba']);
                $role->permissions()->syncWithPivotValues(App\Models\Permission::whereIn('key', $permissions)->pluck('id'), ['tenant_id' => $user->tenant_id]);
                $user->role_id = $role->id;
                $user->save();
            });
        });
    }
    echo json_encode(['created' => true, 'tenant_id' => $user->tenant_id], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'No se pudo crear el fixture aislado: '.get_class($error).PHP_EOL);
    exit(1);
}
