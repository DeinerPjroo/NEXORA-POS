<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Operations\IdempotentOperation;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\CashRegister;
use App\Models\KitchenStation;
use App\Models\Order;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class EmployeeAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('admin@example.test');
        $this->branch = $this->scope(fn () => Branch::firstOrFail()->id);
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function scope(callable $fn): mixed
    {
        return app(TenantContext::class)->run($this->owner->tenant_id, $fn);
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Accesos', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Admin', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function payload(string $email = 'chef@example.test', string $role = 'Cocinero'): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'name' => 'Chef', 'email' => $email, 'role_id' => $this->scope(fn () => Role::where('name', $role)->firstOrFail()->id), 'is_active' => true, 'branch_ids' => [$this->branch], 'password' => 'EmpleadoSeguro123', 'password_confirmation' => 'EmpleadoSeguro123', 'pin' => '482951'];
    }

    private function create(string $email = 'chef@example.test', string $role = 'Cocinero'): array
    {
        return $this->postJson('/api/v1/employees', $this->payload($email, $role))->assertCreated()->json('data');
    }

    private function updateData(array $employee): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'revision' => $employee['employee_revision'], 'name' => $employee['name'], 'email' => $employee['email'], 'role_id' => $employee['role']['id'], 'is_active' => true, 'branch_ids' => [$this->branch]];
    }

    public function test_create_hashes_credentials_replays_exactly_and_never_exposes_secrets(): void
    {
        $body = $this->payload();
        $first = $this->postJson('/api/v1/employees', $body)->assertCreated()->assertJsonPath('data.all_branches', false);
        $id = $first->json('data.id');
        $this->postJson('/api/v1/employees', $body)->assertCreated()->assertJsonPath('data.id', $id);
        $user = User::findOrFail($id);
        $this->assertTrue(Hash::check($body['password'], $user->password));
        $this->assertTrue(Hash::check($body['pin'], $user->pin_hash));
        $this->assertDatabaseHas('employee_branches', ['tenant_id' => $this->owner->tenant_id, 'user_id' => $id, 'branch_id' => $this->branch]);
        $list = $this->getJson('/api/v1/workspace/team')->assertOk()->getContent();
        foreach ([$user->password, $user->pin_hash, 'password', 'pin_hash', 'mfa_secret'] as $secret) {
            $this->assertStringNotContainsString($secret, $list);
        }
        $this->assertDatabaseCount('users', 2);
        $this->scope(fn () => $this->assertSame(1, AuditLog::where('action', 'employee.saved')->count()));
    }

    public function test_tenant_role_owner_self_branch_injection_and_privilege_escalation_are_denied(): void
    {
        $foreign = $this->company('foreign@example.test');
        $foreignBranch = app(TenantContext::class)->run($foreign->tenant_id, fn () => Branch::firstOrFail()->id);
        $body = $this->payload();
        $this->postJson('/api/v1/employees', [...$body, 'role_id' => $foreign->role_id])->assertNotFound();
        $this->postJson('/api/v1/employees', [...$body, 'role_id' => $this->owner->role_id])->assertForbidden();
        $this->postJson('/api/v1/employees', [...$body, 'branch_ids' => [$foreignBranch]])->assertUnprocessable();
        $this->postJson('/api/v1/employees', [...$body, 'all_branches' => true])->assertUnprocessable();
        $this->postJson('/api/v1/employees', [...$body, 'tenant_id' => $foreign->tenant_id])->assertUnprocessable();
        $this->putJson('/api/v1/employees/'.$foreign->id, [...$this->updateData(['employee_revision' => 1, 'name' => 'X', 'email' => 'x@example.test', 'role' => ['id' => $body['role_id']]])])->assertNotFound();
        $this->postJson('/api/v1/employees/'.$this->owner->id.'/security', ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'action' => 'revoke'])->assertForbidden();
        $chef = $this->create();
        $this->actingAs(User::findOrFail($chef['id']));
        $this->postJson('/api/v1/employees', $this->payload('bad@example.test'))->assertForbidden();
        $this->getJson('/api/v1/workspace/team')->assertForbidden();
    }

    public function test_branch_scope_hides_other_branch_orders_cash_and_kitchen_and_blocks_writes(): void
    {
        $chef = $this->create();
        [$other, $station, $register, $order] = $this->scope(function () {
            $other = Branch::create(['name' => 'Otra', 'code' => 'OTRA']);
            $station = KitchenStation::forceCreate(['branch_id' => $other->id, 'name' => 'Privada', 'color' => '#7258CF', 'target_minutes' => 10, 'is_active' => true]);
            $register = CashRegister::create(['branch_id' => $other->id, 'name' => 'Privada', 'code' => 'PRIVADA', 'is_active' => true]);
            $order = Order::create(['public_id' => (string) Str::uuid(), 'branch_id' => $other->id, 'created_by' => $this->owner->id, 'channel' => 'takeaway', 'currency' => 'COP', 'status' => 'preparing', 'subtotal' => '20', 'revision' => 1]);

            return [$other, $station, $register, $order];
        });
        $user = User::findOrFail($chef['id']);
        $this->scope(function () use ($user) {
            $role = Role::findOrFail($user->role_id);
            $role->permissions()->syncWithPivotValues(Permission::pluck('id'), ['tenant_id' => $user->tenant_id]);
        });
        $this->actingAs($user);
        $this->getJson('/api/v1/operations/context')->assertOk()->assertJsonCount(1, 'branches');
        $this->getJson('/api/v1/orders/'.$order->id)->assertNotFound();
        $this->getJson('/api/v1/kitchen-stations?branch_id='.$other->id)->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/cash/registers/'.$register->id.'/open', ['idempotency_key' => (string) Str::uuid(), 'currency' => 'COP', 'opening_amount' => '0'])->assertNotFound();
        $this->postJson('/api/v1/kitchen-stations', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $other->id, 'name' => 'Intrusa', 'color' => '#7258CF', 'target_minutes' => 10, 'is_active' => true])->assertNotFound();
        $this->scope(fn () => $this->assertSame(1, Branch::whereKey($other->id)->count()));
    }

    public function test_updates_are_revisioned_revoke_sessions_and_keep_history(): void
    {
        $employee = $this->create();
        $id = $employee['id'];
        DB::table('sessions')->insert(['id' => 'employee-session', 'user_id' => $id, 'payload' => '', 'last_activity' => time()]);
        $body = [...$this->updateData($employee), 'is_active' => false];
        $this->putJson('/api/v1/employees/'.$id, $body)->assertOk()->assertJsonPath('data.employee_revision', 2)->assertJsonPath('data.is_active', false);
        $this->putJson('/api/v1/employees/'.$id, $body)->assertOk();
        $this->putJson('/api/v1/employees/'.$id, [...$body, 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $this->assertDatabaseMissing('sessions', ['user_id' => $id]);
        $this->assertSame(2, User::findOrFail($id)->mfa_version);
        $this->assertDatabaseCount('users', 2);
    }

    public function test_password_reset_revokes_version_preserves_mfa_and_clears_pin_only_explicitly(): void
    {
        $employee = $this->create();
        $user = User::findOrFail($employee['id']);
        $user->forceFill(['mfa_secret' => 'protected-secret', 'mfa_enabled_at' => now()])->save();
        $body = ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'action' => 'password', 'password' => 'NuevaSegura987', 'password_confirmation' => 'NuevaSegura987', 'clear_pin' => true];
        $this->postJson('/api/v1/employees/'.$user->id.'/security', $body)->assertOk();
        $this->postJson('/api/v1/employees/'.$user->id.'/security', $body)->assertOk();
        $user->refresh();
        $this->assertTrue(Hash::check($body['password'], $user->password));
        $this->assertSame('protected-secret', $user->mfa_secret);
        $this->assertNotNull($user->mfa_enabled_at);
        $this->assertNull($user->pin_hash);
        $this->assertSame(2, $user->mfa_version);
    }

    public function test_audit_failure_rolls_back_employee_credentials_and_assignments(): void
    {
        AuditLog::creating(fn () => throw new \RuntimeException('audit unavailable'));
        $this->postJson('/api/v1/employees', $this->payload())->assertStatus(500);
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('employee_branches', 0);
    }

    public function test_role_edits_require_revision_revoke_sessions_and_cannot_grant_missing_permissions(): void
    {
        $employee = $this->create();
        $role = $employee['role']['id'];
        $this->putJson('/api/v1/roles/'.$role, ['name' => 'Cocina', 'permissions' => ['kitchen.view'], 'revision' => 1])->assertOk()->assertJsonPath('revision', 2);
        $this->putJson('/api/v1/roles/'.$role, ['name' => 'Viejo', 'permissions' => [], 'revision' => 1])->assertConflict();
        $this->assertSame(2, User::findOrFail($employee['id'])->mfa_version);
        $limited = $this->create('limited@example.test', 'Repartidor');
        $this->scope(function () use ($limited) {
            $role = Role::findOrFail($limited['role']['id']);
            $role->permissions()->syncWithPivotValues(Permission::whereIn('key', ['roles.manage', 'roles.view', 'team.manage'])->pluck('id'), ['tenant_id' => $this->owner->tenant_id]);
        });
        $this->actingAs(User::findOrFail($limited['id']));
        $this->postJson('/api/v1/roles', ['name' => 'Escalado', 'permissions' => ['sales.collect']])->assertForbidden();
        $this->postJson('/api/v1/employees', $this->payload('escalado@example.test', 'Cajero'))->assertForbidden();
    }

    public function test_employee_branch_foreign_key_and_inflight_revocation_fail_closed(): void
    {
        $employee = $this->create();
        $stale = User::findOrFail($employee['id']);
        $this->scope(function () use ($stale) {
            User::whereKey($stale->id)->increment('mfa_version');
            try {
                app(IdempotentOperation::class)->run($stale, 'test.revoked', ['idempotency_key' => (string) Str::uuid()], User::class, fn () => throw new \RuntimeException('must not run'));
                $this->fail('Se aceptó una sesión revocada.');
            } catch (HttpException $e) {
                $this->assertSame(403, $e->getStatusCode());
            }
        });
        $foreign = $this->company('other@example.test');
        $branch = app(TenantContext::class)->run($foreign->tenant_id, fn () => Branch::firstOrFail()->id);
        $this->expectException(QueryException::class);
        DB::table('employee_branches')->insert(['tenant_id' => $this->owner->tenant_id, 'user_id' => $stale->id, 'branch_id' => $branch]);
    }

    public function test_existing_password_and_pin_limits_are_preserved(): void
    {
        $body = $this->payload();
        $this->postJson('/api/v1/employees', [...$body, 'pin' => '1234567'])->assertUnprocessable()->assertJsonValidationErrors('pin');
        $password = str_repeat('é', 40).'Ab1';
        $this->postJson('/api/v1/employees', [...$body, 'password' => $password, 'password_confirmation' => $password])->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertDatabaseCount('users', 1);
    }

    public function test_assigned_cashier_can_open_only_authorized_branch_cash(): void
    {
        $employee = $this->create('cashier@example.test', 'Cajero');
        $this->actingAs(User::findOrFail($employee['id']));
        $register = $this->getJson('/api/v1/cash/registers')->assertOk()->json('data.0');
        $body = ['idempotency_key' => (string) Str::uuid(), 'opening_amount' => '100', 'currency' => 'COP'];
        $session = $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', $body)->assertCreated()->json('data');
        $this->postJson('/api/v1/cash/registers/'.$register['id'].'/open', $body)->assertCreated()->assertJsonPath('data.id', $session['id']);
        $this->getJson('/api/v1/cash/sessions/'.$session['id'])->assertOk()->assertJsonPath('data.expected_amount', '100.0000');
        $this->assertDatabaseCount('cash_sessions', 1);
    }

    public function test_waiter_cannot_be_assigned_to_an_unauthorized_branch(): void
    {
        $employee = $this->create('waiter@example.test', 'Mesero');
        $branch = $this->postJson('/api/v1/branches', ['name' => 'Norte', 'code' => 'NORTE'])->assertCreated()->json('id');
        $room = $this->postJson('/api/v1/dining-rooms', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'name' => 'Salón', 'color' => '#7258CF', 'is_active' => true])->assertCreated()->json('data');
        $table = $this->postJson('/api/v1/dining-rooms/'.$room['id'].'/tables', ['idempotency_key' => (string) Str::uuid(), 'room_revision' => 1, 'name' => 'Mesa', 'shape' => 'square', 'color' => '#7258CF', 'capacity' => 4, 'is_active' => true])->assertCreated()->json('data');
        $this->postJson('/api/v1/dining-sessions', ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $branch, 'tables' => [['id' => $table['id'], 'revision' => 1]], 'guest_count' => 2, 'waiter_id' => $employee['id']])->assertUnprocessable();
        $this->assertDatabaseCount('dining_sessions', 0);
    }
}
