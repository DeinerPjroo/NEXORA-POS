<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\CashMovement;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CashTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function owner(string $email = 'cash@example.test'): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function register(User $owner): array
    {
        return $this->actingAs($owner)->getJson('/api/v1/cash/registers')->assertOk()->json('data.0');
    }

    private function open(array $register, array $extra = []): array
    {
        return $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['opening_amount' => '100000.1250', 'currency' => 'COP', 'idempotency_key' => (string) Str::uuid(), ...$extra])->assertCreated()->json('data');
    }

    public function test_principal_register_exists_for_initial_and_new_branch(): void
    {
        $this->register($this->owner());
        $this->assertDatabaseCount('cash_registers', 1);
        $this->postJson('/api/v1/branches', ['name' => 'Norte', 'code' => 'NORTE'])->assertCreated();
        $this->assertDatabaseCount('cash_registers', 2);
    }

    public function test_opening_is_idempotent_and_two_open_sessions_are_impossible(): void
    {
        $register = $this->register($this->owner());
        $key = (string) Str::uuid();
        $a = $this->open($register, ['idempotency_key' => $key]);
        $b = $this->open($register, ['idempotency_key' => $key]);
        $this->assertSame($a['id'], $b['id']);
        $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['opening_amount' => '1', 'currency' => 'COP', 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $this->assertDatabaseCount('cash_sessions', 1);
        $this->assertDatabaseCount('idempotency_records', 1);
    }

    public function test_movements_preserve_decimals_and_retries_do_not_duplicate_cash(): void
    {
        $session = $this->open($this->register($this->owner()));
        $path = '/api/v1/cash/sessions/'.$session['id'].'/movements';
        $data = ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'type' => 'income', 'amount' => '0.0025', 'reason' => 'Ingreso manual de prueba'];
        $id = $this->postJson($path, $data)->assertCreated()->json('data.id');
        $this->postJson($path, array_reverse($data, true))->assertCreated()->assertJsonPath('data.id', $id);
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertJsonPath('data.expected_amount', '100000.1275')->assertJsonPath('data.revision', 2);
        $this->postJson($path, [...$data, 'amount' => '1'])->assertConflict();
        $this->assertDatabaseCount('cash_movements', 1);
    }

    public function test_invalid_egress_zero_and_stale_revision_leave_no_partial_records(): void
    {
        $session = $this->open($this->register($this->owner()));
        $path = '/api/v1/cash/sessions/'.$session['id'].'/movements';
        $data = ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'type' => 'expense', 'amount' => '100001', 'reason' => 'Retiro de efectivo'];
        $this->postJson($path, $data)->assertUnprocessable();
        $this->postJson($path, [...$data, 'amount' => '0'])->assertUnprocessable();
        $this->postJson($path, [...$data, 'amount' => '1', 'revision' => 4])->assertConflict();
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertDatabaseCount('idempotency_records', 1);
    }

    public function test_close_records_signed_difference_and_blocks_later_mutation(): void
    {
        $register = $this->register($this->owner());
        $session = $this->open($register);
        $close = ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'counted_amount' => '100000', 'closing_note' => 'Conteo físico'];
        $this->postJson('/api/v1/cash/sessions/'.$session['id'].'/close', $close)->assertOk()->assertJsonPath('data.difference', '-0.1250')->assertJsonPath('data.status', 'closed');
        $this->postJson('/api/v1/cash/sessions/'.$session['id'].'/close', $close)->assertOk();
        $this->postJson('/api/v1/cash/sessions/'.$session['id'].'/movements', ['idempotency_key' => (string) Str::uuid(), 'revision' => 2, 'type' => 'income', 'amount' => '10', 'reason' => 'No permitido'])->assertConflict();
        $this->getJson('/api/v1/cash/registers')->assertJsonPath('data.0.current_session', null);
        $this->open($register);
        $this->assertDatabaseCount('cash_sessions', 2);
    }

    public function test_foreign_company_cannot_see_or_operate_cash(): void
    {
        $a = $this->owner();
        $register = $this->register($a);
        $session = $this->open($register);
        $b = $this->owner('other@example.test');
        $this->actingAs($b);
        $this->getJson('/api/v1/cash/registers')->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/cash/sessions')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertNotFound();
        $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['opening_amount' => '1', 'currency' => 'COP', 'idempotency_key' => (string) Str::uuid()])->assertNotFound();
        $this->getJson('/api/v1/operations/context')->assertJsonCount(1, 'branches')->assertJsonMissing(['id' => $register['branch_id']]);
    }

    public function test_non_privileged_user_and_inactive_branch_cannot_open_cash(): void
    {
        $owner = $this->owner();
        $register = $this->register($owner);
        $user = app(TenantContext::class)->run($owner->tenant_id, fn () => User::factory()->create());
        $this->actingAs($user)->getJson('/api/v1/cash/registers')->assertForbidden();
        $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['opening_amount' => '1', 'currency' => 'COP', 'idempotency_key' => (string) Str::uuid()])->assertForbidden();
        DB::table('branches')->where('id', $register['branch_id'])->update(['is_active' => false]);
        $this->actingAs($owner)->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['opening_amount' => '1', 'currency' => 'COP', 'idempotency_key' => (string) Str::uuid()])->assertConflict();
    }

    public function test_database_prevents_active_pointer_to_another_register_session(): void
    {
        $owner = $this->owner();
        $a = $this->register($owner);
        $session = $this->open($a);
        $b = $this->postJson('/api/v1/cash/registers', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $a['branch_id'], 'name' => 'Segunda caja', 'code' => 'DOS'])->assertCreated()->json('data.id');
        $this->expectException(QueryException::class);
        DB::table('cash_registers')->where('id', $b)->update(['active_session_id' => $session['id']]);
    }

    public function test_money_overflow_rolls_back_and_movements_are_append_only(): void
    {
        $owner = $this->owner();
        $session = $this->open($this->register($owner), ['opening_amount' => '999999999999999.9999']);
        $path = '/api/v1/cash/sessions/'.$session['id'].'/movements';
        $data = ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'type' => 'income', 'amount' => '0.0001', 'reason' => 'Fuera de rango'];
        $this->postJson($path, $data)->assertUnprocessable();
        $this->assertDatabaseCount('cash_movements', 0);
        $id = $this->postJson($path, [...$data, 'type' => 'expense', 'reason' => 'Retiro válido'])->assertCreated()->json('data.id');
        $this->expectException(\LogicException::class);
        app(TenantContext::class)->run($owner->tenant_id, fn () => CashMovement::findOrFail($id)->update(['amount' => '1']));
    }

    public function test_currency_is_frozen_even_without_products_after_cash_is_opened(): void
    {
        $owner = $this->owner();
        $this->open($this->register($owner));
        $this->putJson('/api/v1/workspace/company', ['name' => 'Oliva', 'business_type' => 'restaurant', 'currency' => 'USD', 'timezone' => 'America/Bogota', 'locale' => 'es-CO'])->assertUnprocessable()->assertJsonValidationErrors('currency');
    }
}
