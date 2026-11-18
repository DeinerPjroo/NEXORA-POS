<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class ModifierCatalogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'modifiers@example.test'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Menú', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $product = $this->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $category, 'sale_price' => '100.005', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $path = '/api/v1/products/'.$product['id'].'/modifier-groups';

        return compact('owner', 'category', 'product', 'path');
    }

    private function group(array $changes = []): array
    {
        return array_replace(['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'currency' => 'COP', 'name' => 'Adicionales', 'kind' => 'addon', 'min_select' => 1, 'max_select' => 2, 'is_active' => true,
            'options' => [['name' => 'Queso', 'extra_price' => '2.5050', 'is_active' => true], ['name' => 'Champiñones', 'extra_price' => '1.0050', 'is_active' => true]]], $changes);
    }

    private function option(int $revision, array $changes = []): array
    {
        return array_replace(['idempotency_key' => (string) Str::uuid(), 'product_revision' => $revision, 'currency' => 'COP', 'name' => 'Queso', 'extra_price' => '2.5050', 'is_active' => true], $changes);
    }

    public function test_group_options_are_atomic_idempotent_and_advance_product_revision(): void
    {
        $work = $this->work();
        $payload = $this->group();
        $group = $this->postJson($work['path'], $payload)->assertCreated()->assertJsonPath('data.revision', 1)->assertJsonMissingPath('data.tenant_id')->json('data');
        $this->postJson($work['path'], $payload)->assertCreated()->assertJsonPath('data.id', $group['id']);
        $this->postJson($work['path'], array_replace($payload, ['name' => 'Otro']))->assertConflict();
        $this->assertDatabaseCount('product_modifier_groups', 1);
        $this->assertDatabaseCount('product_modifier_options', 2);
        $this->getJson($work['path'])->assertOk()->assertJsonPath('product_revision', 2)->assertJsonPath('data.0.options_count', 2)->assertJsonPath('data.0.active_options_count', 2);
        $configuration = $this->getJson('/api/v1/products/'.$work['product']['id'].'/modifier-configuration')->assertOk()->assertJsonPath('product_revision', 2)->assertJsonPath('data.0.options.0.extra_price', '2.5050')->assertJsonMissingPath('data.0.options.0.tenant_id')->json('data.0');
        $options = $configuration['options'];
        $this->putJson($work['path'].'/'.$group['id'].'/options/'.$options[0]['id'], $this->option(1))->assertConflict();
        $update = $this->option(2, ['extra_price' => '2.7050']);
        $this->putJson($work['path'].'/'.$group['id'].'/options/'.$options[0]['id'], $update)->assertOk()->assertJsonPath('data.extra_price', '2.7050');
        $this->putJson($work['path'].'/'.$group['id'].'/options/'.$options[0]['id'], $update)->assertOk();
        $this->getJson($work['path'])->assertJsonPath('product_revision', 3)->assertJsonPath('data.0.revision', 2);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'catalog.modifier_option.updated')->count());
    }

    public function test_archive_never_leaves_active_group_below_minimum_and_history_is_preserved(): void
    {
        $work = $this->work();
        $group = $this->postJson($work['path'], $this->group())->assertCreated()->json('data');
        $options = $this->getJson($work['path'].'/'.$group['id'].'/options')->json('data');
        $base = $work['path'].'/'.$group['id'];
        $this->putJson($base.'/options/'.$options[0]['id'], $this->option(2, ['is_active' => false]))->assertOk();
        $this->putJson($base.'/options/'.$options[1]['id'], $this->option(3, ['name' => 'Champiñones', 'is_active' => false]))->assertUnprocessable();
        $this->putJson($base, ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 3, 'currency' => 'COP', 'name' => 'Adicionales', 'min_select' => 1, 'max_select' => 2, 'is_active' => false])->assertOk();
        $this->putJson($base.'/options/'.$options[1]['id'], $this->option(4, ['name' => 'Champiñones', 'is_active' => false]))->assertOk();
        $this->putJson($base, ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 5, 'currency' => 'COP', 'name' => 'Adicionales', 'min_select' => 1, 'max_select' => 2, 'is_active' => true])->assertUnprocessable();
        $this->getJson('/api/v1/products/'.$work['product']['id'].'/modifier-configuration')->assertJsonCount(0, 'data');
        $this->getJson($work['path'].'?status=inactive')->assertJsonCount(1, 'data')->assertJsonPath('data.0.active_options_count', 0);
        $this->getJson($base.'/options?status=inactive')->assertJsonCount(2, 'data');
        $this->assertDatabaseCount('product_modifier_options', 2);
    }

    public function test_invalid_limits_duplicate_options_exclusions_and_currency_never_create_groups(): void
    {
        $work = $this->work();
        foreach ([['min_select' => 3], ['max_select' => 0], ['min_select' => 3, 'max_select' => 3], ['options' => [['name' => 'Queso', 'extra_price' => '1', 'is_active' => true], ['name' => 'queso', 'extra_price' => '2', 'is_active' => true]]], ['kind' => 'exclusion'], ['tenant_id' => $work['owner']->tenant_id], ['options' => [['name' => 'Número', 'extra_price' => 1.5, 'is_active' => true]]]] as $changes) {
            $this->postJson($work['path'], $this->group($changes))->assertUnprocessable();
        }
        $this->postJson($work['path'], $this->group(['currency' => 'USD']))->assertConflict();
        $this->assertDatabaseCount('product_modifier_groups', 0);
        $this->assertDatabaseCount('product_modifier_options', 0);
        $exclusion = $this->postJson($work['path'], $this->group(['kind' => 'exclusion', 'name' => 'Sin ingredientes', 'min_select' => 0, 'max_select' => 1, 'options' => [['name' => 'Sin cebolla', 'extra_price' => '0', 'is_active' => true]]]))->assertCreated()->json('data');
        $this->postJson($work['path'].'/'.$exclusion['id'].'/options', $this->option(2, ['name' => 'Sin tomate', 'extra_price' => '1']))->assertUnprocessable();
    }

    public function test_active_group_limit_does_not_delete_archives_and_lists_are_paginated(): void
    {
        $work = $this->work();
        for ($index = 0; $index < 8; $index++) {
            $this->postJson($work['path'], $this->group(['product_revision' => $index + 1, 'name' => 'Grupo '.$index, 'min_select' => 0]))->assertCreated();
        }
        $this->postJson($work['path'], $this->group(['product_revision' => 9, 'name' => 'Exceso']))->assertUnprocessable();
        $this->postJson($work['path'], $this->group(['product_revision' => 9, 'name' => 'Archivado', 'is_active' => false]))->assertCreated();
        $this->getJson($work['path'].'?per_page=5')->assertJsonCount(5, 'data')->assertJsonPath('meta.total', 9)->assertJsonPath('meta.last_page', 2);
        $this->getJson($work['path'].'?per_page=5&page=2')->assertJsonCount(4, 'data');
        $this->getJson('/api/v1/products/'.$work['product']['id'].'/modifier-configuration')->assertJsonCount(8, 'data');
    }

    public function test_foreign_scope_bindings_permissions_and_replay_authorization_are_checked(): void
    {
        $first = $this->work();
        $payload = $this->group();
        $group = $this->postJson($first['path'], $payload)->assertCreated()->json('data');
        $second = $this->work('other-modifiers@example.test');
        $this->getJson($first['path'])->assertNotFound();
        $this->getJson($second['path'].'/'.$group['id'].'/options')->assertNotFound();
        $role = DB::table('roles')->where('tenant_id', $second['owner']->tenant_id)->where('name', 'Cajero')->first();
        DB::table('role_permission')->insert(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'catalog.view')->value('id')]);
        $this->actingAs(User::factory()->create(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id]));
        $this->getJson('/api/v1/products/'.$second['product']['id'].'/modifier-configuration')->assertOk();
        $this->postJson($second['path'], $this->group())->assertForbidden();
        DB::table('role_permission')->where('role_id', $first['owner']->role_id)->where('permission_id', DB::table('permissions')->where('key', 'catalog.manage')->value('id'))->delete();
        $this->actingAs($first['owner']->fresh());
        $this->postJson($first['path'], $payload)->assertForbidden();
    }

    public function test_active_option_limit_preserves_archived_options_and_server_pages(): void
    {
        $work = $this->work();
        $group = $this->postJson($work['path'], $this->group(['min_select' => 0, 'max_select' => 20, 'options' => array_map(fn ($index) => ['name' => 'Opción '.$index, 'extra_price' => '0.0001', 'is_active' => true], range(0, 19))]))->assertCreated()->json('data');
        $path = $work['path'].'/'.$group['id'].'/options';
        $this->postJson($path, $this->option(2, ['name' => 'Nueva']))->assertUnprocessable();
        $inactive = $this->postJson($path, $this->option(2, ['name' => 'Archivada', 'is_active' => false]))->assertCreated()->json('data');
        $first = $this->getJson($path.'?per_page=10')->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 21)->assertJsonPath('meta.last_page', 3)->json('data.0');
        $this->getJson($path.'?per_page=10&page=3')->assertJsonCount(1, 'data');
        $this->putJson($path.'/'.$first['id'], $this->option(3, ['name' => $first['name'], 'is_active' => false]))->assertOk();
        $this->putJson($path.'/'.$inactive['id'], $this->option(4, ['name' => 'Archivada']))->assertOk();
        $this->getJson('/api/v1/products/'.$work['product']['id'].'/modifier-configuration')->assertJsonCount(20, 'data.0.options');
        $this->assertDatabaseCount('product_modifier_options', 21);
    }

    public function test_same_company_nested_bindings_reject_another_product_group_and_another_group_option(): void
    {
        $work = $this->work();
        $group = $this->postJson($work['path'], $this->group())->assertCreated()->json('data');
        $second = $this->postJson('/api/v1/products', ['name' => 'Otra pizza', 'sku' => 'PIZZA-2', 'category_id' => $work['category'], 'sale_price' => '10', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->getJson('/api/v1/products/'.$second['id'].'/modifier-groups/'.$group['id'].'/options')->assertNotFound();
        $other = $this->postJson($work['path'], $this->group(['product_revision' => 2, 'name' => 'Otro grupo']))->assertCreated()->json('data');
        $option = $this->getJson($work['path'].'/'.$other['id'].'/options')->json('data.0');
        $this->putJson($work['path'].'/'.$group['id'].'/options/'.$option['id'], $this->option(3))->assertNotFound();
    }

    public function test_group_creation_rolls_back_initial_options_revision_and_uuid_when_audit_fails(): void
    {
        $work = $this->work();
        $records = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'catalog.modifier_group.created') {
                throw new \RuntimeException('Auditoría de modificador fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson($work['path'], $this->group());
            $this->fail('La creación exige auditoría atómica.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de modificador fallida', $error->getMessage());
        }
        $this->assertDatabaseCount('product_modifier_groups', 0);
        $this->assertDatabaseCount('product_modifier_options', 0);
        $this->assertDatabaseCount('idempotency_records', $records);
        $this->assertDatabaseHas('products', ['id' => $work['product']['id'], 'revision' => 1]);
    }

    public function test_database_rejects_option_with_product_different_from_its_group(): void
    {
        $first = $this->work();
        $group = $this->postJson($first['path'], $this->group())->assertCreated()->json('data');
        $second = $this->work('fk-modifiers@example.test');
        $this->expectException(QueryException::class);
        DB::table('product_modifier_options')->insert(['tenant_id' => $first['owner']->tenant_id, 'product_id' => $second['product']['id'], 'modifier_group_id' => $group['id'], 'name' => 'Ajena', 'extra_price' => '0', 'is_active' => true]);
    }
}
