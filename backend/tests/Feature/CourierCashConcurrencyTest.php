<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\Branch;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Str;
use Tests\SqlConcurrencyTestCase;

class CourierCashConcurrencyTest extends SqlConcurrencyTestCase
{
    public function test_identical_uuid_and_competing_partial_returns_preserve_both_ledgers(): void
    {
        $this->requireSql();
        PermissionCatalog::seed();
        $actor = app(RegisterCompany::class)->execute(['company_name' => 'Custodia SQL', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Operador', 'email' => 'custody-sql@example.test', 'password' => 'SeguraNexora123']);
        [$branch, $courier] = app(TenantContext::class)->run($actor->tenant_id, function () {
            return [Branch::firstOrFail()->id, User::factory()->create(['role_id' => Role::where('name', 'Repartidor')->firstOrFail()->id, 'all_branches' => true])->id];
        });
        $this->actingAs($actor)->withHeader('Origin', 'http://127.0.0.1:5173');
        $register = $this->getJson('/api/v1/cash/registers')->assertOk()->json('data.0.id');
        $cash = $this->postJson('/api/v1/cash/registers/'.$register.'/open', ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '1000', 'currency' => 'COP'])->assertCreated()->json('data');
        $data = ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'kind' => 'advance', 'account_revision' => 0, 'expected_balance' => '0', 'amount' => '100.01', 'cash_session_id' => $cash['id'], 'cash_revision' => 1, 'reason' => 'Fondo confirmado', 'confirmed_handover' => true];
        $job = ['operation' => 'courier.cash', 'actor_id' => $actor->id, 'resource_id' => $courier, 'data' => $data];
        $this->assertSame([true, true], array_column($this->race([$job, $job]), 'accepted'));
        $this->assertDatabaseCount('cash_movements', 1);
        $this->assertDatabaseCount('courier_cash_transfers', 1);
        $job['data'] = [...$data, 'idempotency_key' => (string) Str::uuid(), 'kind' => 'return', 'amount' => '60', 'account_revision' => 1, 'expected_balance' => '100.01', 'cash_revision' => 2];
        $other = $job;
        $other['data']['idempotency_key'] = (string) Str::uuid();
        $accepted = array_column($this->race([$job, $other]), 'accepted');
        sort($accepted);
        $this->assertSame([false, true], $accepted);
        $this->assertDatabaseHas('courier_cash_accounts', ['balance' => '40.0100', 'revision' => 2]);
        $this->assertDatabaseHas('cash_sessions', ['id' => $cash['id'], 'expected_amount' => '959.9900', 'revision' => 3]);
        $this->assertDatabaseCount('courier_cash_transfers', 2);
        $this->assertDatabaseCount('sales', 0);
    }
}
