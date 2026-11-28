<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\CashSession;
use App\Models\CourierCashAccount;
use App\Models\CourierCashTransfer;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CourierCashTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $courier;

    private int $branch;

    private array $cash;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('custody@example.test');
        [$this->branch, $this->courier] = $this->scope(function () {
            $branch = Branch::firstOrFail()->id;
            $courier = User::factory()->create(['role_id' => Role::where('name', 'Repartidor')->firstOrFail()->id, 'all_branches' => false]);
            $courier->branches()->attach($branch, ['tenant_id' => $courier->tenant_id]);

            return [$branch, $courier];
        });
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        $register = $this->getJson('/api/v1/cash/registers')->assertOk()->json('data.0.id');
        $this->cash = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000.00', 'currency' => 'COP'])->assertCreated()->json('data');
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Custodia', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Operador', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function scope(callable $callback): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $callback);
    }

    private function url(): string
    {
        return '/api/v1/deliveries/couriers/'.$this->courier->id.'/cash';
    }

    private function body(array $changes = []): array
    {
        return [...['idempotency_key' => (string) Str::uuid(), 'branch_id' => $this->branch, 'kind' => 'advance', 'account_revision' => 0, 'expected_balance' => '0.0000', 'amount' => '100.01', 'cash_session_id' => $this->cash['id'], 'cash_revision' => 1, 'reason' => 'Fondo para cambio', 'confirmed_handover' => true], ...$changes];
    }

    public function test_advance_partial_return_and_replay_conserve_cash_plus_custody_without_sales(): void
    {
        $body = $this->body();
        $this->postJson($this->url(), $body)->assertOk()->assertJsonPath('data.balance_after', '100.0100')->assertJsonPath('data.confirmed_handover', true);
        $this->postJson($this->url(), $body)->assertOk();
        $return = $this->body(['kind' => 'return', 'account_revision' => 1, 'expected_balance' => '100.0100', 'cash_revision' => 2, 'amount' => '40.01', 'reason' => 'Devolución parcial recibida']);
        $this->postJson($this->url(), $return)->assertOk()->assertJsonPath('data.balance_after', '60.0000');
        $this->postJson($this->url(), $return)->assertOk();
        $this->scope(function () {
            $this->assertSame('940.0000', CashSession::firstOrFail()->expected_amount);
            $this->assertSame('60.0000', CourierCashAccount::firstOrFail()->balance);
        });
        $this->getJson($this->url().'?branch_id='.$this->branch)->assertOk()->assertJsonCount(2, 'data');
        $this->assertDatabaseCount('courier_cash_transfers', 2);
        $this->assertDatabaseCount('cash_movements', 2);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_stale_cash_or_custody_and_over_return_are_rejected_atomically(): void
    {
        $this->postJson($this->url(), $this->body())->assertOk();
        $this->postJson($this->url(), $this->body(['cash_revision' => 2]))->assertConflict();
        $this->postJson($this->url(), $this->body(['account_revision' => 1, 'expected_balance' => '100.01']))->assertConflict();
        $this->postJson($this->url(), $this->body(['account_revision' => 1, 'expected_balance' => '100.01', 'cash_revision' => 2, 'kind' => 'return', 'amount' => '100.02']))->assertUnprocessable();
        $this->assertDatabaseCount('cash_movements', 1);
        $this->assertDatabaseCount('courier_cash_transfers', 1);
    }

    public function test_invalid_amount_unconfirmed_handover_and_insufficient_cash_do_not_create_accounts(): void
    {
        foreach ([['amount' => '0'], ['amount' => '-1'], ['amount' => '0.001'], ['confirmed_handover' => false], ['amount' => '1000.01']] as $invalid) {
            $this->postJson($this->url(), $this->body($invalid))->assertUnprocessable();
        }
        $this->assertDatabaseCount('courier_cash_accounts', 0);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_audit_failure_rolls_back_both_ledgers_and_preserves_retry_key(): void
    {
        $fail = true;
        AuditLog::creating(function ($log) use (&$fail) {
            if ($fail && $log->action === 'courier.cash.transferred') {
                throw new \RuntimeException('Audit unavailable');
            }
        });
        $body = $this->body();
        $this->postJson($this->url(), $body)->assertServerError();
        $this->assertDatabaseCount('courier_cash_accounts', 0);
        $this->assertDatabaseCount('courier_cash_transfers', 0);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->scope(fn () => $this->assertSame('1000.0000', CashSession::firstOrFail()->expected_amount));
        $fail = false;
        $this->postJson($this->url(), $body)->assertOk();
    }

    public function test_foreign_tenant_and_operational_only_actor_cannot_access_funds(): void
    {
        $foreign = $this->company('foreign-custody@example.test');
        $this->actingAs($foreign)->postJson($this->url(), $this->body())->assertNotFound();
        $this->getJson('/api/v1/deliveries/courier-cash?branch_id='.$this->branch)->assertNotFound();
        $this->actingAs($this->courier)->postJson($this->url(), $this->body())->assertForbidden();
        $this->getJson('/api/v1/deliveries/courier-cash?branch_id='.$this->branch)->assertForbidden();
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_return_remains_possible_after_courier_is_deactivated_but_new_advance_is_blocked(): void
    {
        $this->postJson($this->url(), $this->body())->assertOk();
        $this->scope(fn () => $this->courier->forceFill(['is_active' => false])->save());
        $next = ['account_revision' => 1, 'expected_balance' => '100.01', 'cash_revision' => 2];
        $this->postJson($this->url(), $this->body($next))->assertConflict();
        $this->postJson($this->url(), $this->body([...$next, 'kind' => 'return']))->assertOk()->assertJsonPath('data.balance_after', '0.0000');
        $this->scope(fn () => $this->assertSame('1000.0000', CashSession::firstOrFail()->expected_amount));
    }

    public function test_branch_revocation_blocks_custody_replay_and_reads(): void
    {
        $manager = $this->scope(function () {
            $role = Role::create(['name' => 'Gestor de fondos', 'is_owner' => false]);
            $role->permissions()->attach(Permission::whereIn('key', ['orders.view', 'orders.manage', 'cash.view', 'cash.movements'])->pluck('id'), ['tenant_id' => $this->owner->tenant_id]);
            $user = User::factory()->create(['role_id' => $role->id, 'all_branches' => false]);
            $user->branches()->attach($this->branch, ['tenant_id' => $user->tenant_id]);

            return $user;
        });
        $body = $this->body();
        $this->actingAs($manager)->postJson($this->url(), $body)->assertOk();
        $this->scope(fn () => $manager->branches()->detach($this->branch));
        $this->postJson($this->url(), $body)->assertNotFound();
        $this->getJson($this->url().'?branch_id='.$this->branch)->assertNotFound();
        $this->getJson('/api/v1/deliveries/courier-cash?branch_id='.$this->branch)->assertNotFound();
        $this->assertDatabaseCount('courier_cash_transfers', 1);
    }

    public function test_closed_cash_session_is_rejected_without_creating_custody(): void
    {
        $this->postJson('/api/v1/cash/sessions/'.$this->cash['id'].'/close', ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'counted_amount' => '1000.00'])->assertOk();
        $this->postJson($this->url(), $this->body(['cash_revision' => 2]))->assertConflict();
        $this->assertDatabaseCount('courier_cash_accounts', 0);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_wrong_branch_cash_is_rejected_and_composite_fk_prevents_relinking_a_transfer(): void
    {
        $this->postJson($this->url(), $this->body())->assertOk();
        $branch = $this->scope(fn () => Branch::create(['name' => 'Segunda', 'code' => 'SECOND', 'is_active' => true]));
        $register = $this->postJson('/api/v1/cash/registers', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch->id, 'name' => 'Caja segunda', 'code' => 'SECOND'])->assertCreated()->json('data');
        $cash = $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $this->postJson($this->url(), $this->body(['cash_session_id' => $cash['id'], 'cash_revision' => 1, 'account_revision' => 1, 'expected_balance' => '100.01']))->assertConflict();
        $movement = $this->postJson('/api/v1/cash/sessions/'.$cash['id'].'/movements', ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'type' => 'income', 'amount' => '1', 'reason' => 'Entrada de prueba'])->assertCreated()->json('data');
        $this->expectException(QueryException::class);
        $this->scope(fn () => DB::transaction(fn () => CourierCashTransfer::create([
            'branch_id' => $this->branch, 'courier_cash_account_id' => CourierCashAccount::firstOrFail()->id,
            'cash_session_id' => $cash['id'], 'cash_movement_id' => $movement['id'], 'actor_id' => $this->owner->id,
            'kind' => 'return', 'amount' => '1', 'balance_after' => '99.01', 'account_revision' => 2,
            'reason' => 'Relacion invalida', 'confirmed_handover' => true, 'created_at' => now(),
        ])));
    }
}
