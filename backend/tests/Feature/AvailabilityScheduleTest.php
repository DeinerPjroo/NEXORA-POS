<?php

namespace Tests\Feature;

use App\Domains\Catalog\AvailabilitySchedule;
use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductAvailabilityWindow;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class AvailabilityScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
        $this->travelTo(CarbonImmutable::parse('2026-11-18T16:30:00Z'));
    }

    private function work(string $email = 'schedule@example.test'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Carta', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $product = $this->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $category, 'sale_price' => '100.0050', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $branch = app(TenantContext::class)->run($owner->tenant_id, fn () => Branch::firstOrFail()->id);
        $path = '/api/v1/products/'.$product['id'];

        return compact('owner', 'category', 'product', 'branch', 'path');
    }

    private function payload(int $revision = 1, array $changes = []): array
    {
        return array_replace(['idempotency_key' => (string) Str::uuid(), 'product_revision' => $revision, 'currency' => 'COP', 'expected_timezone' => 'America/Bogota', 'name' => 'Almuerzo', 'weekday' => 3, 'start_time' => '11:00', 'end_time' => '12:00', 'ends_next_day' => false, 'valid_from' => null, 'valid_until' => null, 'is_active' => true], $changes);
    }

    private function enable(array $work, int $revision = 2, bool $enabled = true): array
    {
        return $this->putJson($work['path'].'/availability-policy', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => $revision, 'currency' => 'COP', 'expected_timezone' => 'America/Bogota', 'enabled' => $enabled])->assertOk()->json('data');
    }

    private function resolve(array $work, string $at, string $timezone = 'America/Bogota'): array
    {
        return app(TenantContext::class)->run($work['owner']->tenant_id, function () use ($work, $at, $timezone) {
            $product = Product::findOrFail($work['product']['id']);

            return app(AvailabilitySchedule::class)->evaluate($product, $product->availabilityWindows()->get(), CarbonImmutable::parse($at), $timezone);
        });
    }

    public function test_default_policy_and_explicit_empty_schedule_preserve_manual_availability(): void
    {
        $work = $this->work();
        $this->getJson($work['path'])->assertJsonPath('data.sellable', true)->assertJsonPath('data.availability_schedule_enabled', false)->assertJsonPath('data.availability_context.allowed', true);
        $this->enable($work, 1);
        $this->getJson('/api/v1/products?availability=available')->assertJsonCount(1, 'data')->assertJsonPath('data.0.is_available', true)->assertJsonPath('data.0.sellable', false)->assertJsonPath('data.0.availability_context.reason', 'Fuera del horario de disponibilidad');
        $this->enable($work, 2, false);
        DB::table('products')->where('id', $work['product']['id'])->update(['is_available' => false]);
        $this->getJson($work['path'])->assertJsonPath('data.availability_context.allowed', true)->assertJsonPath('data.sellable', false);
    }

    public function test_weekly_start_inclusive_and_end_exclusive_use_company_wall_time(): void
    {
        $work = $this->work();
        $window = $this->postJson($work['path'].'/availability-windows', $this->payload())->assertCreated()->json('data');
        $this->enable($work);
        foreach (['2026-11-18T15:59:59Z' => false, '2026-11-18T16:00:00Z' => true, '2026-11-18T16:59:59Z' => true, '2026-11-18T17:00:00Z' => false, '2026-11-19T16:30:00Z' => false] as $at => $expected) {
            $this->assertSame($expected, $this->resolve($work, $at)['allowed'], $at);
        }
        $this->getJson($work['path'])->assertJsonPath('data.availability_context.allowed', true)->assertJsonPath('data.availability_context.windows.0.id', $window['id'])->assertJsonPath('data.availability_context.checked_at', '2026-11-18T16:30:00+00:00');
        $this->assertFalse($this->resolve($work, '2026-11-18T16:30:00Z', 'Europe/Madrid')['allowed']);
    }

    public function test_midnight_window_anchors_validity_to_start_date_including_last_valid_night(): void
    {
        $work = $this->work();
        $this->postJson($work['path'].'/availability-windows', $this->payload(1, ['weekday' => 5, 'start_time' => '22:00', 'end_time' => '02:00', 'ends_next_day' => true, 'valid_from' => '2026-11-20', 'valid_until' => '2026-11-20']))->assertCreated();
        $this->enable($work);
        foreach (['2026-11-14T06:00:00Z' => false, '2026-11-21T02:59:59Z' => false, '2026-11-21T03:00:00Z' => true, '2026-11-21T06:59:59Z' => true, '2026-11-21T07:00:00Z' => false, '2026-11-28T06:00:00Z' => false] as $at => $expected) {
            $this->assertSame($expected, $this->resolve($work, $at)['allowed'], $at);
        }
        $this->assertSame('2026-11-20', $this->resolve($work, '2026-11-21T06:00:00Z')['windows'][0]['anchor_date']);
    }

    public function test_explicit_twenty_four_hours_and_overlapping_windows_form_a_union(): void
    {
        $work = $this->work();
        $this->postJson($work['path'].'/availability-windows', $this->payload(1, ['start_time' => '11:00', 'end_time' => '11:00', 'ends_next_day' => true]))->assertCreated();
        $this->postJson($work['path'].'/availability-windows', $this->payload(2))->assertCreated();
        $this->enable($work, 3);
        $this->assertCount(2, $this->resolve($work, '2026-11-18T16:30:00Z')['windows']);
        $this->assertTrue($this->resolve($work, '2026-11-19T15:59:59Z')['allowed']);
        $this->assertFalse($this->resolve($work, '2026-11-19T16:00:00Z')['allowed']);
    }

    public function test_dst_repeated_and_missing_hours_follow_the_actual_local_clock(): void
    {
        $work = $this->work();
        $this->postJson($work['path'].'/availability-windows', $this->payload(1, ['weekday' => 7, 'start_time' => '02:15', 'end_time' => '02:45']))->assertCreated();
        $this->enable($work);
        $this->assertTrue($this->resolve($work, '2026-10-25T00:30:00Z', 'Europe/Madrid')['allowed']);
        $this->assertTrue($this->resolve($work, '2026-10-25T01:30:00Z', 'Europe/Madrid')['allowed']);
        $this->assertFalse($this->resolve($work, '2026-03-29T00:30:00Z', 'Europe/Madrid')['allowed']);
        $this->assertFalse($this->resolve($work, '2026-03-29T01:30:00Z', 'Europe/Madrid')['allowed']);
    }

    public function test_invalid_clock_date_and_forged_scopes_never_create_windows(): void
    {
        $work = $this->work();
        foreach ([['weekday' => 0], ['start_time' => '24:00'], ['start_time' => '1:00'], ['end_time' => '11:00'], ['end_time' => '10:00'], ['ends_next_day' => true], ['valid_from' => '2026-02-30'], ['valid_from' => '2026-11-20', 'valid_until' => '2026-11-19'], ['tenant_id' => 1], ['variant_id' => 1]] as $change) {
            $this->postJson($work['path'].'/availability-windows', $this->payload(1, $change))->assertUnprocessable();
        }
        $this->assertDatabaseCount('product_availability_windows', 0);
        $this->postJson($work['path'].'/availability-windows', $this->payload(1, ['currency' => 'USD']))->assertConflict();
    }

    public function test_revision_idempotency_archive_and_policy_replay_are_atomic(): void
    {
        $work = $this->work();
        $body = $this->payload();
        $window = $this->postJson($work['path'].'/availability-windows', $body)->assertCreated()->json('data');
        $this->postJson($work['path'].'/availability-windows', $body)->assertCreated()->assertJsonPath('data.id', $window['id']);
        $this->enable($work);
        $update = $this->payload(3, ['revision' => 1, 'is_active' => false]);
        $this->putJson($work['path'].'/availability-windows/'.$window['id'], array_replace($update, ['product_revision' => 1]))->assertConflict();
        $this->putJson($work['path'].'/availability-windows/'.$window['id'], array_replace($update, ['revision' => 99]))->assertConflict();
        $this->putJson($work['path'].'/availability-windows/'.$window['id'], $update)->assertOk()->assertJsonPath('data.revision', 2);
        $this->putJson($work['path'].'/availability-windows/'.$window['id'], $update)->assertOk()->assertJsonPath('data.revision', 2);
        $this->getJson($work['path'].'/availability-windows?status=inactive')->assertJsonCount(1, 'data')->assertJsonPath('enabled', true)->assertJsonPath('availability_context.allowed', false)->assertJsonPath('product_revision', 4);
        $policy = ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 4, 'currency' => 'COP', 'expected_timezone' => 'America/Bogota', 'enabled' => false];
        $this->putJson($work['path'].'/availability-policy', $policy)->assertOk();
        $this->putJson($work['path'].'/availability-policy', $policy)->assertOk()->assertJsonPath('data.product_revision', 5);
        $this->assertDatabaseCount('product_availability_windows', 1);
        DB::table('role_permission')->where('role_id', $work['owner']->role_id)->where('permission_id', DB::table('permissions')->where('key', 'catalog.manage')->value('id'))->delete();
        $this->actingAs($work['owner']->fresh());
        $this->postJson($work['path'].'/availability-windows', $body)->assertForbidden();
    }

    public function test_active_limit_archives_and_pages_do_not_truncate_history(): void
    {
        $work = $this->work();
        app(TenantContext::class)->run($work['owner']->tenant_id, function () use ($work) {
            for ($i = 0; $i < 28; $i++) {
                $window = new ProductAvailabilityWindow;
                $window->product_id = $work['product']['id'];
                $window->fill(array_intersect_key($this->payload(), array_flip($window->getFillable())))->save();
            }
        });
        $this->postJson($work['path'].'/availability-windows', $this->payload())->assertUnprocessable();
        $this->postJson($work['path'].'/availability-windows', $this->payload(1, ['is_active' => false]))->assertCreated();
        $this->getJson($work['path'].'/availability-windows?per_page=10&page=3')->assertJsonCount(9, 'data')->assertJsonPath('meta.total', 29);
        $this->getJson($work['path'].'/availability-windows?status=inactive')->assertJsonCount(1, 'data');
    }

    public function test_foreign_binding_permissions_and_audit_failure_preserve_configuration(): void
    {
        $first = $this->work();
        $window = $this->postJson($first['path'].'/availability-windows', $this->payload())->assertCreated()->json('data');
        $second = $this->work('foreign-schedule@example.test');
        $this->getJson($first['path'].'/availability-windows')->assertNotFound();
        $this->putJson($second['path'].'/availability-windows/'.$window['id'], $this->payload(1, ['revision' => 1]))->assertNotFound();
        $role = DB::table('roles')->where('tenant_id', $second['owner']->tenant_id)->where('name', 'Encargado de inventario')->first();
        DB::table('role_permission')->insert(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'catalog.view')->value('id')]);
        $this->actingAs(User::factory()->create(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id]));
        $this->getJson($second['path'].'/availability-windows')->assertOk()->assertJsonMissingPath('cost_price');
        $this->postJson($second['path'].'/availability-windows', $this->payload())->assertForbidden();
        $this->putJson($second['path'].'/availability-policy', ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'currency' => 'COP', 'enabled' => true])->assertForbidden();
        $this->actingAs($second['owner']);
        $before = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'catalog.availability_window.created') {
                throw new \RuntimeException('Auditoría de horario fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson($second['path'].'/availability-windows', $this->payload());
            $this->fail('La configuración exige auditoría.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de horario fallida', $error->getMessage());
        }
        $this->assertDatabaseCount('product_availability_windows', 1);
        $this->assertDatabaseCount('idempotency_records', $before);
        $this->assertDatabaseHas('products', ['id' => $second['product']['id'], 'revision' => 1]);
    }

    public function test_composite_fk_rejects_window_linked_to_foreign_product(): void
    {
        $first = $this->work();
        $second = $this->work('fk-schedule@example.test');
        $this->expectException(QueryException::class);
        DB::table('product_availability_windows')->insert(['tenant_id' => $second['owner']->tenant_id, 'product_id' => $first['product']['id'], 'name' => 'Ajena', 'weekday' => 1, 'start_time' => '10:00', 'end_time' => '11:00', 'ends_next_day' => false, 'is_active' => true]);
    }

    public function test_timezone_context_is_required_and_checked_under_lock_without_breaking_registered_replay(): void
    {
        $work = $this->work();
        $body = $this->payload();
        $window = $this->postJson($work['path'].'/availability-windows', $body)->assertCreated()->json('data');
        DB::table('tenants')->where('id', $work['owner']->tenant_id)->update(['timezone' => 'Europe/Madrid']);
        $this->postJson($work['path'].'/availability-windows', $body)->assertCreated()->assertJsonPath('data.id', $window['id']);
        $this->postJson($work['path'].'/availability-windows', $this->payload(2))->assertConflict();
        $this->putJson($work['path'].'/availability-windows/'.$window['id'], $this->payload(2, ['revision' => 1]))->assertConflict();
        $policy = ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'currency' => 'COP', 'expected_timezone' => 'America/Bogota', 'enabled' => true];
        $this->putJson($work['path'].'/availability-policy', $policy)->assertConflict();
        $this->postJson($work['path'].'/availability-windows', $this->payload(2, ['expected_timezone' => null]))->assertUnprocessable();
        $this->postJson($work['path'].'/availability-windows', $this->payload(2, ['expected_timezone' => 'Zona/inventada']))->assertUnprocessable();
        $this->postJson($work['path'].'/availability-windows', $this->payload(2, ['expected_timezone' => 'Europe/Madrid']))->assertCreated();
        $this->putJson($work['path'].'/availability-policy', array_replace($policy, ['product_revision' => 3, 'expected_timezone' => 'Europe/Madrid']))->assertOk()->assertJsonPath('data.product_revision', 4);
        $this->assertDatabaseCount('product_availability_windows', 2);
    }

    public function test_image_mutations_return_current_schedule_eligibility_instead_of_assuming_open(): void
    {
        Storage::fake('catalog');
        $work = $this->work();
        $this->enable($work, 1);
        $this->postJson($work['path'].'/image', ['revision' => 2, 'image' => UploadedFile::fake()->image('pizza.png', 100, 100)])->assertOk()->assertJsonPath('data.sellable', false)->assertJsonPath('data.availability_context.allowed', false)->assertJsonPath('data.revision', 3);
        $this->deleteJson($work['path'].'/image', ['revision' => 3])->assertOk()->assertJsonPath('data.sellable', false)->assertJsonPath('data.availability_context.allowed', false)->assertJsonPath('data.revision', 4);
    }
}
