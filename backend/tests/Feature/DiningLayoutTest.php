<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\DiningRoom;
use App\Models\DiningTable;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class DiningLayoutTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private string $base = '/api/v1/dining-rooms';

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->owner = $this->company('dining@example.test');
        $this->actingAs($this->owner);
        $this->branch = app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::firstOrFail()->id);
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function room(array $changes = []): array
    {
        return $this->postJson($this->base, ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $this->branch, 'name' => 'Terraza', 'color' => '#F5F7FB', 'is_active' => true, ...$changes])->assertCreated()->json('data');
    }

    private function table(array $room, array $changes = []): array
    {
        return $this->postJson($this->base.'/'.$room['id'].'/tables', $this->tableInput($room, $changes))->assertCreated()->json('data');
    }

    private function tableInput(array $room, array $changes = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'room_revision' => $room['revision'], 'name' => 'Mesa 1', 'shape' => 'circle', 'color' => '#8271FF', 'capacity' => 4, 'is_active' => true, ...$changes];
    }

    private function detail(int $id): array
    {
        return $this->getJson($this->base.'/'.$id)->assertOk()->json('data');
    }

    private function layout(array $room, array $changes = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'revision' => $room['revision'], 'schema_version' => 1,
            'tables' => array_map(fn ($t) => array_intersect_key($t, array_flip(['id', 'x', 'y', 'width', 'height', 'rotation'])), $room['tables']),
            'objects' => [], ...$changes];
    }

    public function test_configuration_layout_archive_and_pagination_persist_without_money_or_occupancy(): void
    {
        $room = $this->room();
        $table = $this->table($room);
        $room = $this->detail($room['id']);
        $this->assertSame(2, $room['revision']);
        $payload = $this->layout($room, ['objects' => [['id' => (string) Str::uuid(), 'kind' => 'door', 'label' => 'Entrada', 'color' => '#123456', 'x' => 0, 'y' => 200, 'width' => 20, 'height' => 80, 'rotation' => 90]]]);
        $payload['tables'][0] = [...$payload['tables'][0], 'x' => 500, 'y' => 300, 'width' => 100, 'height' => 100, 'rotation' => 45];
        $this->putJson($this->base.'/'.$room['id'].'/layout', $payload)->assertOk()->assertJsonPath('data.revision', 3)->assertJsonPath('data.tables.0.x', 500)->assertJsonPath('data.tables.0.revision', 2)->assertJsonPath('data.objects.0.label', 'Entrada');
        $this->putJson($this->base.'/'.$room['id'].'/tables/'.$table['id'], [...$this->tableInput(['revision' => 3]), 'revision' => 2, 'is_active' => false])->assertOk();
        $this->getJson($this->base.'/'.$room['id'].'/tables?status=archived&per_page=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1);
        $room = $this->detail($room['id']);
        $this->assertSame([], $room['tables']);
        $this->putJson($this->base.'/'.$room['id'], ['idempotency_key' => (string) Str::uuid(), 'revision' => $room['revision'], 'name' => 'Terraza', 'color' => '#FFFFFF', 'is_active' => false])->assertOk();
        $this->getJson($this->base.'?status=archived&search=Terra')->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_idempotency_exact_payload_stale_revision_and_permission_before_replay(): void
    {
        $room = $this->room();
        $input = $this->tableInput($room);
        $url = $this->base.'/'.$room['id'].'/tables';
        $first = $this->postJson($url, $input)->assertCreated()->json('data.id');
        $this->postJson($url, $input)->assertCreated()->assertJsonPath('data.id', $first);
        $this->postJson($url, [...$input, 'name' => 'Cambio'])->assertConflict();
        $this->postJson($url, $this->tableInput($room, ['name' => 'Mesa 2']))->assertConflict();
        $this->assertDatabaseCount('dining_tables', 1);
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'dining.manage')->value('id'))->delete();
        $this->owner->unsetRelation('role');
        $this->postJson($url, $input)->assertForbidden();
        $this->getJson($this->base)->assertOk();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->delete();
        $this->owner->unsetRelation('role');
        $this->getJson($this->base)->assertForbidden();
    }

    public function test_layout_rejects_missing_duplicate_foreign_ids_unknown_code_and_invalid_geometry_atomically(): void
    {
        $room = $this->room();
        $table = $this->table($room);
        $room = $this->detail($room['id']);
        $url = $this->base.'/'.$room['id'].'/layout';
        $this->putJson($url, $this->layout($room, ['tables' => []]))->assertConflict();
        $p = $this->layout($room);
        $p['tables'][] = $p['tables'][0];
        $this->putJson($url, $p)->assertUnprocessable();
        $p = $this->layout($room);
        $p['tables'][0]['id'] = 999999;
        $this->putJson($url, $p)->assertConflict();
        foreach ([['x' => 990], ['width' => 100, 'height' => 90], ['rotation' => 360], ['x' => -1], ['style' => 'position:fixed']] as $changes) {
            $p = $this->layout($room);
            $p['tables'][0] = [...$p['tables'][0], ...$changes];
            $this->putJson($url, $p)->assertUnprocessable();
        }
        $p = $this->layout($room, ['objects' => [['id' => (string) Str::uuid(), 'kind' => 'script', 'label' => 'X', 'color' => 'red', 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10, 'rotation' => 0, 'html' => '<script/>']]]);
        $this->putJson($url, $p)->assertUnprocessable();
        $p = $this->layout($room);
        $p['tables'][0]['x'] = 200;
        $p['objects'] = [['id' => (string) Str::uuid(), 'kind' => 'wall', 'label' => 'Pared', 'color' => '#123456', 'x' => 990, 'y' => 0, 'width' => 20, 'height' => 10, 'rotation' => 0]];
        $this->putJson($url, $p)->assertUnprocessable();
        $this->assertSame($table['x'], $this->detail($room['id'])['tables'][0]['x']);
        $this->assertSame($room['revision'], $this->detail($room['id'])['revision']);
    }

    public function test_cross_tenant_reads_writes_context_and_nested_binding_are_scoped(): void
    {
        $room = $this->room();
        $table = $this->table($room);
        $second = $this->room(['name' => 'Interior']);
        $this->putJson($this->base.'/'.$second['id'].'/tables/'.$table['id'], [...$this->tableInput($second), 'revision' => 1])->assertNotFound();
        $other = $this->company('other-dining@example.test');
        $this->actingAs($other);
        $this->getJson($this->base)->assertOk()->assertJsonCount(0, 'data');
        $this->getJson($this->base.'/'.$room['id'])->assertNotFound();
        $this->postJson($this->base, ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $this->branch, 'name' => 'Ataque', 'color' => '#123456', 'is_active' => true])->assertUnprocessable();
        $this->putJson($this->base.'/'.$room['id'].'/layout', $this->layout(['revision' => 2, 'tables' => []]))->assertNotFound();
        $this->getJson('/api/v1/operations/context')->assertOk();
        app(TenantContext::class)->clear();
        foreach ([DiningRoom::class, DiningTable::class] as $model) {
            try {
                $model::count();
                $this->fail('A tenant context must be required.');
            } catch (\LogicException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_composite_foreign_keys_reject_other_branch_and_tenant_even_without_scopes(): void
    {
        $room = $this->room();
        $table = $this->table($room);
        $other = $this->company('foreign-dining@example.test');
        $foreignBranch = app(TenantContext::class)->run($other->tenant_id, fn () => Branch::firstOrFail()->id);
        foreach ([fn () => DB::table('dining_rooms')->where('id', $room['id'])->update(['branch_id' => $foreignBranch]),
            fn () => DB::table('dining_tables')->where('id', $table['id'])->update(['tenant_id' => $other->tenant_id]),
            fn () => DB::table('dining_tables')->where('id', $table['id'])->update(['branch_id' => $foreignBranch])] as $write) {
            try {
                DB::transaction($write);
                $this->fail('Foreign key accepted an unrelated identity.');
            } catch (QueryException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_audit_failure_rolls_back_layout_table_revision_and_idempotency_record(): void
    {
        $room = $this->room();
        $this->table($room);
        $room = $this->detail($room['id']);
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'dining.layout.updated') {
                throw new \RuntimeException('audit unavailable');
            }
        });
        $p = $this->layout($room);
        $p['tables'][0]['x'] = 500;
        $this->putJson($this->base.'/'.$room['id'].'/layout', $p)->assertStatus(500);
        $fresh = $this->detail($room['id']);
        $this->assertSame($room['revision'], $fresh['revision']);
        $this->assertSame($room['tables'], $fresh['tables']);
        $this->assertDatabaseMissing('idempotency_records', ['key' => $p['idempotency_key']]);
    }

    public function test_limits_unique_names_archived_history_and_revision_conflicts(): void
    {
        $room = $this->room();
        $this->room(['name' => 'Interior']);
        $this->postJson($this->base, ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $this->branch, 'name' => 'Interior', 'color' => '#123456', 'is_active' => true])->assertUnprocessable();
        for ($n = 1; $n <= 48; $n++) {
            $this->table(['id' => $room['id'], 'revision' => $n], ['name' => 'Mesa '.$n]);
        }
        $room = $this->detail($room['id']);
        $this->postJson($this->base.'/'.$room['id'].'/tables', $this->tableInput($room, ['name' => 'Exceso']))->assertUnprocessable();
        $this->postJson($this->base.'/'.$room['id'].'/tables', $this->tableInput($room, ['name' => 'Mesa 1', 'is_active' => false]))->assertUnprocessable();
        $this->putJson($this->base.'/'.$room['id'].'/tables/'.$room['tables'][0]['id'], [...$this->tableInput($room), 'revision' => 999])->assertConflict();
        $this->getJson($this->base.'?per_page=51')->assertUnprocessable();
        $this->putJson($this->base.'/'.$room['id'].'/layout', $this->layout($room, ['schema_version' => 2]))->assertUnprocessable();
        $this->assertDatabaseCount('dining_tables', 48);
    }
}
