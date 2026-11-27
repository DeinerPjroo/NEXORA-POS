<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Kitchen\KitchenDisplay;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\KitchenStation;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class KitchenStationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $branch;

    private string $url = '/api/v1/kitchen-stations';

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->owner = $this->company('kitchen@example.test');
        $this->actingAs($this->owner)->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->branch = app(TenantContext::class)->run($this->owner->tenant_id, fn () => Branch::firstOrFail()->id);
    }

    public function test_station_display_is_closed_revisioned_and_preserved_when_legacy_clients_omit_it(): void
    {
        $display = KitchenDisplay::defaults();
        $display['labels']['preparing'] = 'En horno';
        $display['warning_minutes'] = 2;
        $body = $this->input(['display_settings' => $display]);
        $station = $this->postJson($this->url, $body)->assertCreated()->assertJsonPath('data.display_settings.labels.preparing', 'En horno')->json('data');
        $this->postJson($this->url, $body)->assertCreated()->assertJsonPath('data.revision', 1);
        $edit = $this->input(['revision' => 1]);
        unset($edit['branch_id']);
        $this->putJson($this->url.'/'.$station['id'], $edit)->assertOk()->assertJsonPath('data.display_settings', $display);
        $this->putJson($this->url.'/'.$station['id'], [...$edit, 'display_settings' => $display, 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        foreach ([['javascript' => 'alert(1)'], ['labels' => [...$display['labels'], 'new' => '<script>']], ['warning_minutes' => 61], ['warning_minutes' => 30]] as $invalid) {
            $this->postJson($this->url, $this->input(['display_settings' => [...$display, ...$invalid]]))->assertUnprocessable();
        }
        $this->assertDatabaseCount('kitchen_stations', 1);
        $this->assertDatabaseCount('kitchen_tickets', 0);
    }

    private function company(string $email): User
    {
        return app(RegisterCompany::class)->execute(['company_name' => 'Cocina real', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
    }

    private function input(array $changes = []): array
    {
        return ['idempotency_key' => (string) Str::uuid(), 'branch_id' => $this->branch, 'name' => 'Parrilla', 'color' => '#8271FF', 'target_minutes' => 15, 'is_active' => true, ...$changes];
    }

    public function test_create_replay_filter_pagination_and_archive_preserve_configuration_without_financial_effects(): void
    {
        $input = $this->input();
        $station = $this->postJson($this->url, $input)->assertCreated()->assertJsonPath('data.target_minutes', 15)->json('data');
        $this->postJson($this->url, $input)->assertCreated()->assertJsonPath('data.id', $station['id']);
        $this->postJson($this->url, [...$input, 'name' => 'Otro'])->assertConflict();
        $this->postJson($this->url, $this->input())->assertUnprocessable();
        $this->postJson($this->url, $this->input(['name' => 'Bebidas']))->assertCreated();
        $this->getJson($this->url.'?per_page=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2);
        $edit = $this->input(['revision' => '1', 'target_minutes' => 20, 'is_active' => false]);
        unset($edit['branch_id']);
        $this->putJson($this->url.'/'.$station['id'], $edit)->assertOk()->assertJsonPath('data.revision', 2)->assertJsonPath('data.is_active', false);
        $this->getJson($this->url.'?status=active')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson($this->url.'?status=archived&search=Parrilla&branch_id='.$this->branch)->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertDatabaseHas('audit_logs', ['action' => 'kitchen.station.updated', 'tenant_id' => $this->owner->tenant_id]);
    }

    public function test_stale_revision_and_invalid_values_are_rejected_without_changes(): void
    {
        foreach ([['target_minutes' => 0], ['target_minutes' => 1441], ['target_minutes' => 1.5], ['color' => 'url(x)'], ['tenant_id' => $this->owner->tenant_id], ['name' => ''], ['revision' => 1]] as $changes) {
            $this->postJson($this->url, $this->input($changes))->assertUnprocessable();
        }
        $station = $this->postJson($this->url, $this->input())->assertCreated()->json('data');
        $edit = $this->input(['revision' => 2, 'target_minutes' => 30]);
        unset($edit['branch_id']);
        $this->putJson($this->url.'/'.$station['id'], $edit)->assertConflict();
        $this->assertDatabaseHas('kitchen_stations', ['id' => $station['id'], 'revision' => 1, 'target_minutes' => 15]);
    }

    public function test_tenant_binding_filters_context_and_composite_fk_fail_closed(): void
    {
        $station = $this->postJson($this->url, $this->input())->assertCreated()->json('data');
        $other = $this->company('other-kitchen@example.test');
        $foreign = app(TenantContext::class)->run($other->tenant_id, fn () => Branch::firstOrFail()->id);
        $this->actingAs($other);
        $this->getJson($this->url)->assertOk()->assertJsonCount(0, 'data');
        $this->getJson($this->url.'?branch_id='.$this->branch)->assertUnprocessable();
        $this->postJson($this->url, $this->input())->assertUnprocessable();
        $edit = $this->input(['revision' => 1]);
        unset($edit['branch_id']);
        $this->putJson($this->url.'/'.$station['id'], $edit)->assertNotFound();
        try {
            DB::transaction(fn () => DB::table('kitchen_stations')->where('id', $station['id'])->update(['branch_id' => $foreign]));
            $this->fail('Una sucursal ajena debe rechazarse por FK.');
        } catch (QueryException) {
            $this->assertTrue(true);
        }
        app(TenantContext::class)->clear();
        $this->expectException(\LogicException::class);
        KitchenStation::count();
    }

    public function test_permission_is_checked_before_replay_and_reader_can_only_consult(): void
    {
        $input = $this->input();
        $this->postJson($this->url, $input)->assertCreated();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->where('permission_id', DB::table('permissions')->where('key', 'kitchen.manage')->value('id'))->delete();
        $this->owner->unsetRelation('role');
        $this->postJson($this->url, $input)->assertForbidden();
        $this->getJson($this->url)->assertOk();
        $this->getJson('/api/v1/operations/context')->assertOk();
        DB::table('role_permission')->where('role_id', $this->owner->role_id)->delete();
        $this->owner->unsetRelation('role');
        $this->getJson($this->url)->assertForbidden();
        $this->assertDatabaseCount('kitchen_stations', 1);
    }

    public function test_audit_failure_rolls_back_station_and_operation_uuid(): void
    {
        $input = $this->input();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'kitchen.station.created') {
                throw new \RuntimeException('audit unavailable');
            }
        });
        $this->postJson($this->url, $input)->assertStatus(500);
        $this->assertDatabaseCount('kitchen_stations', 0);
        $this->assertDatabaseMissing('idempotency_records', ['key' => $input['idempotency_key']]);
    }
}
