<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class DiningReservationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private array $room;

    private array $tables = [];

    private function key(): array
    {
        return ['idempotency_key' => (string) Str::uuid()];
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-19T12:00:00-05:00'));
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->owner = $this->company('reservations@example.test');
        $this->actingAs($this->owner);
        $this->branch = app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $this->room = $this->postJson('/api/v1/dining-rooms', [...$this->key(), 'branch_id' => $this->branch, 'name' => 'Reservas', 'color' => '#FFFFFF', 'is_active' => true])->assertCreated()->json('data');
        for ($i = 1; $i <= 2; $i++) {
            $this->tables[] = $this->postJson('/api/v1/dining-rooms/'.$this->room['id'].'/tables', [...$this->key(), 'room_revision' => $i, 'name' => 'Mesa '.$i, 'shape' => 'circle', 'color' => '#DCD6FF', 'capacity' => 4, 'is_active' => true])->assertCreated()->json('data');
        }
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function input(array $changes = []): array
    {
        return [...$this->key(), 'branch_id' => $this->branch, 'expected_timezone' => 'America/Bogota', 'guest_name' => 'María', 'phone' => '3001234567', 'guest_count' => 3, 'notes' => 'Ventana', 'starts_at' => '2026-11-19T13:00:00-05:00', 'ends_at' => '2026-11-19T14:00:00-05:00', 'tables' => [['id' => $this->tables[0]['id'], 'revision' => 1]], ...$changes];
    }

    private function book(array $changes = []): array
    {
        return $this->postJson('/api/v1/dining-reservations', $this->input($changes))->assertCreated()->json('data');
    }

    private function state(array $r, string $state, array $changes = []): array
    {
        return [...$this->key(), 'revision' => $r['revision'], 'status' => $state, ...$changes];
    }

    public function test_overlap_boundaries_capacity_revisions_and_exact_idempotency(): void
    {
        $p = $this->input();
        $r = $this->postJson('/api/v1/dining-reservations', $p)->assertCreated()->assertJsonPath('data.starts_at', '2026-11-19T18:00:00.000000Z')->json('data');
        $this->postJson('/api/v1/dining-reservations', $p)->assertCreated()->assertJsonPath('data.id', $r['id']);
        $this->postJson('/api/v1/dining-reservations', [...$p, 'guest_name' => 'Cambio'])->assertConflict();
        $this->postJson('/api/v1/dining-reservations', $this->input())->assertConflict();
        $this->book(['starts_at' => '2026-11-19T14:00:00-05:00', 'ends_at' => '2026-11-19T15:00:00-05:00']);
        $this->book(['tables' => [['id' => $this->tables[1]['id'], 'revision' => 1]]]);
        $this->postJson('/api/v1/dining-reservations', $this->input(['guest_count' => 5]))->assertUnprocessable();
        $this->postJson('/api/v1/dining-reservations', $this->input(['tables' => [['id' => $this->tables[1]['id'], 'revision' => 9]]]))->assertConflict();
        $this->getJson('/api/v1/dining-reservations?date=2026-11-19&per_page=1')->assertOk()->assertJsonPath('meta.total', 3);
        $this->getJson('/api/v1/dining/reservation-tables?branch_id='.$this->branch)->assertOk()->assertJsonPath('meta.total', 2);
    }

    public function test_reschedule_preserves_table_history_and_cancel_frees_window(): void
    {
        $r = $this->book();
        $p = $this->input(['revision' => 1, 'tables' => [['id' => $this->tables[1]['id'], 'revision' => 1]], 'starts_at' => '2026-11-19T15:00:00-05:00', 'ends_at' => '2026-11-19T16:00:00-05:00']);
        unset($p['branch_id']);
        $r = $this->putJson('/api/v1/dining-reservations/'.$r['id'], $p)->assertOk()->assertJsonPath('data.revision', 2)->assertJsonPath('data.tables.0.table_name', 'Mesa 2')->json('data');
        $this->putJson('/api/v1/dining-reservations/'.$r['id'], $p)->assertOk();
        $this->assertDatabaseCount('dining_reservation_tables', 2);
        $this->assertSame(1, DB::table('dining_reservation_tables')->where('is_active', false)->count());
        $this->book();
        $cancel = $this->state($r, 'cancelled');
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $cancel)->assertOk();
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $cancel)->assertOk();
        $this->book(['tables' => [['id' => $this->tables[1]['id'], 'revision' => 1]], 'starts_at' => '2026-11-19T15:00:00-05:00', 'ends_at' => '2026-11-19T16:00:00-05:00']);
    }

    public function test_arrival_reuses_real_occupancy_and_pending_reservation_blocks_walkin(): void
    {
        $r = $this->book();
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $this->state($r, 'arrived', ['waiter_id' => null]))->assertConflict();
        $this->travelTo(CarbonImmutable::parse('2026-11-19T13:05:00-05:00'));
        $this->postJson('/api/v1/dining-sessions', [...$this->key(), 'branch_id' => $this->branch, 'guest_count' => 2, 'waiter_id' => null, 'tables' => [['id' => $this->tables[0]['id'], 'revision' => 1]]])->assertConflict();
        $p = $this->state($r, 'arrived', ['waiter_id' => $this->owner->id]);
        $r = $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $p)->assertOk()->assertJsonPath('data.status', 'arrived')->json('data');
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $p)->assertOk()->assertJsonPath('data.dining_session_id', $r['dining_session_id']);
        $this->getJson('/api/v1/dining-rooms/'.$this->room['id'].'/occupancy')->assertJsonPath('data.0.session.id', $r['dining_session_id']);
        $this->assertDatabaseCount('dining_sessions', 1);
        $this->assertDatabaseCount('sales', 0);
        $this->postJson('/api/v1/dining-reservations', $this->input(['starts_at' => '2026-11-19T13:15:00-05:00']))->assertConflict();
        $this->postJson('/api/v1/dining-sessions/'.$r['dining_session_id'].'/close', [...$this->key(), 'revision' => 1])->assertOk();
        $this->book(['starts_at' => '2026-11-19T13:15:00-05:00']);
    }

    public function test_busy_arrival_and_audit_failure_roll_back_both_reservation_and_occupation(): void
    {
        $r = $this->book();
        $session = $this->postJson('/api/v1/dining-sessions', [...$this->key(), 'branch_id' => $this->branch, 'guest_count' => 2, 'waiter_id' => null, 'tables' => [['id' => $this->tables[0]['id'], 'revision' => 1]]])->assertCreated()->json('data');
        $this->travelTo(CarbonImmutable::parse('2026-11-19T13:00:00-05:00'));
        $p = $this->state($r, 'arrived', ['waiter_id' => null]);
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $p)->assertConflict();
        $this->postJson('/api/v1/dining-sessions/'.$session['id'].'/close', [...$this->key(), 'revision' => 1])->assertOk();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'dining.reservation.arrived') {
                throw new \RuntimeException('audit down');
            }
        });
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $p)->assertStatus(500);
        $this->assertDatabaseHas('dining_reservations', ['id' => $r['id'], 'status' => 'booked', 'revision' => 1, 'dining_session_id' => null]);
        $this->assertDatabaseCount('dining_sessions', 1);
        $this->assertSame(0, DB::table('dining_session_tables')->whereNull('released_at')->count());
        $this->assertDatabaseMissing('idempotency_records', ['key' => $p['idempotency_key']]);
    }

    public function test_timezone_offset_duration_dst_and_company_timezone_revision(): void
    {
        $this->postJson('/api/v1/dining-reservations', $this->input(['starts_at' => '2026-11-19T18:00:00+00:00']))->assertUnprocessable();
        $this->postJson('/api/v1/dining-reservations', $this->input(['ends_at' => '2026-11-19T13:10:00-05:00']))->assertUnprocessable();
        $this->postJson('/api/v1/dining-reservations', $this->input(['expected_timezone' => 'America/New_York']))->assertConflict();
        DB::table('tenants')->where('id', $this->owner->tenant_id)->update(['timezone' => 'America/New_York']);
        $this->travelTo(CarbonImmutable::parse('2027-03-01T12:00:00Z'));
        $this->postJson('/api/v1/dining-reservations', $this->input(['expected_timezone' => 'America/New_York', 'starts_at' => '2027-03-14T02:30:00-05:00', 'ends_at' => '2027-03-14T04:00:00-04:00']))->assertUnprocessable();
        $this->book(['expected_timezone' => 'America/New_York', 'starts_at' => '2027-03-14T03:00:00-04:00', 'ends_at' => '2027-03-14T04:00:00-04:00']);
        $this->travelTo(CarbonImmutable::parse('2027-10-30T12:00:00Z'));
        $this->book(['expected_timezone' => 'America/New_York', 'starts_at' => '2027-11-07T01:00:00-04:00', 'ends_at' => '2027-11-07T01:00:00-05:00']);
        $this->book(['expected_timezone' => 'America/New_York', 'starts_at' => '2027-11-07T01:00:00-05:00', 'ends_at' => '2027-11-07T02:00:00-05:00']);
    }

    public function test_no_show_permissions_tenant_foreign_keys_and_protected_configuration(): void
    {
        $r = $this->book();
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $this->state($r, 'no_show'))->assertConflict();
        $this->putJson('/api/v1/dining-rooms/'.$this->room['id'], [...$this->key(), 'revision' => 3, 'name' => 'Reservas', 'color' => '#FFFFFF', 'is_active' => false])->assertConflict();
        $this->putJson('/api/v1/dining-rooms/'.$this->room['id'].'/tables/'.$this->tables[0]['id'], [...$this->key(), 'room_revision' => 3, 'revision' => 1, 'name' => 'Mesa 1', 'shape' => 'circle', 'color' => '#FFFFFF', 'capacity' => 2, 'is_active' => true])->assertConflict();
        $other = $this->company('other-reservation@example.test');
        $this->actingAs($other);
        $this->getJson('/api/v1/dining-reservations/'.$r['id'])->assertNotFound();
        $this->getJson('/api/v1/dining-reservations')->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/dining-reservations', $this->input())->assertUnprocessable();
        $this->actingAs($this->owner);
        try {
            DB::transaction(fn () => DB::table('dining_reservation_tables')->where('dining_reservation_id', $r['id'])->update(['tenant_id' => $other->tenant_id]));
            $this->fail('Cross tenant table accepted.');
        } catch (QueryException) {
            $this->assertTrue(true);
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-19T14:00:00-05:00'));
        $noShow = $this->state($r, 'no_show');
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $noShow)->assertOk();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'dining.reserve')->value('id'))->delete();
        $this->owner->unsetRelation('role');
        $this->postJson('/api/v1/dining-reservations/'.$r['id'].'/state', $noShow)->assertForbidden();
        $this->getJson('/api/v1/dining-reservations')->assertForbidden();
    }

    public function test_calendar_day_uses_company_zone_across_midnight_and_fractional_offset(): void
    {
        DB::table('tenants')->where('id', $this->owner->tenant_id)->update(['timezone' => 'Asia/Kathmandu']);
        $this->travelTo(CarbonImmutable::parse('2026-11-19T00:00:00Z'));
        $this->book(['expected_timezone' => 'Asia/Kathmandu', 'starts_at' => '2026-11-20T00:15:00+05:45', 'ends_at' => '2026-11-20T00:45:00+05:45']);
        $this->getJson('/api/v1/dining-reservations?date=2026-11-20')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.starts_at', '2026-11-19T18:30:00.000000Z');
        $this->getJson('/api/v1/dining-reservations?date=2026-11-19')->assertOk()->assertJsonPath('meta.total', 0);
        $this->postJson('/api/v1/dining-reservations', $this->input(['expected_timezone' => 'Asia/Kathmandu', 'starts_at' => '2026-11-20T00:30:00+05:45', 'ends_at' => '2026-11-20T01:00:00+05:45']))->assertConflict();
    }
}
