<?php

namespace Tests\Feature;

use App\Domains\Catalog\CatalogPriceResolver;
use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Tenancy\TenantContext;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class ContextPriceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::seed();
        $this->withHeader('Origin', 'http://127.0.0.1:5173');
    }

    private function work(string $email = 'context-price@example.test'): array
    {
        $owner = app(RegisterCompany::class)->execute(['company_name' => 'Oliva', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => $email, 'password' => 'SeguraNexora123']);
        $this->actingAs($owner);
        $category = $this->postJson('/api/v1/categories', ['name' => 'Menú', 'color' => '#8271FF', 'is_active' => true])->assertCreated()->json('id');
        $product = $this->postJson('/api/v1/products', ['name' => 'Pizza', 'sku' => 'PIZZA', 'category_id' => $category, 'sale_price' => '100.0050', 'currency' => 'COP', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        [$branch, $other] = app(TenantContext::class)->run($owner->tenant_id, fn () => [Branch::firstOrFail()->id, Branch::create(['name' => 'Norte', 'code' => 'NORTE', 'is_active' => true])->id]);
        $path = '/api/v1/products/'.$product['id'].'/context-prices';

        return compact('owner', 'category', 'product', 'branch', 'other', 'path');
    }

    private function payload(int $revision, array $changes = []): array
    {
        return array_replace(['idempotency_key' => (string) Str::uuid(), 'product_revision' => $revision, 'currency' => 'COP', 'variant_id' => null, 'branch_id' => null, 'channel' => 'takeaway', 'amount' => '90.0050', 'is_active' => true], $changes);
    }

    private function resolve(array $work, int $branch, string $channel, ?int $variant = null): array
    {
        return app(TenantContext::class)->run($work['owner']->tenant_id, function () use ($work, $branch, $channel, $variant) {
            $service = app(CatalogPriceResolver::class);

            return $service->resolve(Product::findOrFail($work['product']['id']), $variant ? ProductVariant::findOrFail($variant) : null, Branch::findOrFail($branch), $channel, $service->candidates([$work['product']['id']], $variant ? [$variant] : [], $branch, $channel));
        });
    }

    public function test_precedence_and_archival_fallback_are_exact_for_two_branches_and_channels(): void
    {
        $work = $this->work();
        $channel = $this->postJson($work['path'], $this->payload(1))->assertCreated()->json('data');
        $branch = $this->postJson($work['path'], $this->payload(2, ['branch_id' => $work['branch'], 'channel' => 'all', 'amount' => '80.0050']))->assertCreated()->json('data');
        $exact = $this->postJson($work['path'], $this->payload(3, ['branch_id' => $work['branch'], 'amount' => '70.0050']))->assertCreated()->json('data');
        $this->assertSame('70.0050', $this->resolve($work, $work['branch'], 'takeaway')['amount']);
        $this->assertSame('80.0050', $this->resolve($work, $work['branch'], 'dine_in')['amount']);
        $this->assertSame('90.0050', $this->resolve($work, $work['other'], 'takeaway')['amount']);
        $this->assertSame('100.0050', $this->resolve($work, $work['other'], 'dine_in')['amount']);
        $this->assertSame($exact['id'], $this->resolve($work, $work['branch'], 'takeaway')['rule_id']);
        foreach ([[$exact, 4, '80.0050'], [$branch, 5, '90.0050'], [$channel, 6, '100.0050']] as [$price, $revision, $expected]) {
            $this->putJson($work['path'].'/'.$price['id'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => $revision, 'revision' => 1, 'currency' => 'COP', 'amount' => $price['amount'], 'is_active' => false])->assertOk();
            $this->assertSame($expected, $this->resolve($work, $work['branch'], 'takeaway')['amount']);
        }
        $this->getJson($work['path'].'?per_page=2')->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 3)->assertJsonPath('meta.last_page', 2)->assertJsonPath('product_revision', 7);
        $this->getJson($work['path'].'?status=active')->assertJsonCount(0, 'data');
        $this->assertDatabaseCount('product_context_prices', 3);
    }

    public function test_uuid_revision_identity_and_zero_amount_are_validated_without_touching_base_price(): void
    {
        $work = $this->work();
        $payload = $this->payload(1, ['amount' => '0']);
        $price = $this->postJson($work['path'], $payload)->assertCreated()->assertJsonPath('data.amount', '0.0000')->assertJsonMissingPath('data.variant_scope')->assertJsonMissingPath('data.tenant_id')->json('data');
        $this->postJson($work['path'], $payload)->assertCreated()->assertJsonPath('data.id', $price['id']);
        $this->postJson($work['path'], array_replace($payload, ['amount' => '1']))->assertConflict();
        $this->postJson($work['path'], $this->payload(2))->assertUnprocessable();
        $this->postJson($work['path'], $this->payload(2, ['branch_id' => $work['branch'], 'variant_scope' => 1]))->assertUnprocessable();
        $this->postJson($work['path'], $this->payload(2, ['channel' => 'all']))->assertUnprocessable();
        $this->postJson($work['path'], $this->payload(2, ['channel' => 'dine_in', 'amount' => 1.5]))->assertUnprocessable();
        $this->putJson($work['path'].'/'.$price['id'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'revision' => 99, 'currency' => 'COP', 'amount' => '5', 'is_active' => true])->assertConflict();
        $this->putJson($work['path'].'/'.$price['id'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 2, 'revision' => 1, 'currency' => 'COP', 'amount' => '5', 'is_active' => true, 'channel' => 'dine_in'])->assertUnprocessable();
        $this->getJson('/api/v1/products/'.$work['product']['id'])->assertJsonPath('data.sale_price', '100.0050')->assertJsonPath('data.revision', 2);
        $this->assertSame('0.0000', $this->resolve($work, $work['branch'], 'takeaway')['amount']);
    }

    public function test_variant_keeps_own_price_and_rule_instead_of_inheriting_fixed_product_price(): void
    {
        $work = $this->work();
        $this->postJson($work['path'], $this->payload(1, ['amount' => '5']))->assertCreated();
        $variant = $this->postJson('/api/v1/products/'.$work['product']['id'].'/variants', ['product_revision' => 2, 'currency' => 'COP', 'name' => 'Grande', 'sku' => 'PIZZA-G', 'sale_price' => '120.0050', 'is_active' => true, 'is_available' => true])->assertCreated()->json('data');
        $this->assertSame('120.0050', $this->resolve($work, $work['branch'], 'takeaway', $variant['id'])['amount']);
        $this->postJson($work['path'], $this->payload(3, ['channel' => 'dine_in']))->assertUnprocessable();
        $rule = $this->postJson($work['path'], $this->payload(3, ['variant_id' => $variant['id'], 'amount' => '110.0050']))->assertCreated()->json('data');
        $resolved = $this->resolve($work, $work['branch'], 'takeaway', $variant['id']);
        $this->assertSame('110.0050', $resolved['amount']);
        $this->assertSame($rule['id'], $resolved['rule_id']);
        $this->assertSame('120.0050', $this->resolve($work, $work['branch'], 'dine_in', $variant['id'])['amount']);
        $this->getJson($work['path'].'?variant_id='.$variant['id'])->assertJsonCount(1, 'data')->assertJsonPath('data.0.variant_id', $variant['id']);
        $this->getJson($work['path'])->assertJsonCount(1, 'data')->assertJsonPath('data.0.variant_id', null);
    }

    public function test_generated_scope_unique_index_rejects_duplicate_with_two_nullable_ids(): void
    {
        $work = $this->work();
        $this->postJson($work['path'], $this->payload(1))->assertCreated();
        $this->expectException(QueryException::class);
        DB::table('product_context_prices')->insert(['tenant_id' => $work['owner']->tenant_id, 'product_id' => $work['product']['id'], 'variant_id' => null, 'branch_id' => null, 'channel' => 'takeaway', 'amount' => '1', 'is_active' => true]);
    }

    public function test_foreign_scopes_and_reader_writes_are_rejected_but_narrow_branch_metadata_is_available(): void
    {
        $first = $this->work();
        $payload = $this->payload(1);
        $price = $this->postJson($first['path'], $payload)->assertCreated()->json('data');
        $second = $this->work('other-context@example.test');
        $this->getJson($first['path'])->assertNotFound();
        $this->putJson($second['path'].'/'.$price['id'], ['idempotency_key' => (string) Str::uuid(), 'product_revision' => 1, 'revision' => 1, 'currency' => 'COP', 'amount' => '1', 'is_active' => false])->assertNotFound();
        $this->postJson($second['path'], $this->payload(1, ['branch_id' => $first['branch']]))->assertUnprocessable();
        $role = DB::table('roles')->where('tenant_id', $second['owner']->tenant_id)->where('name', 'Cajero')->first();
        DB::table('role_permission')->insert(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id, 'permission_id' => DB::table('permissions')->where('key', 'catalog.view')->value('id')]);
        $this->actingAs(User::factory()->create(['tenant_id' => $second['owner']->tenant_id, 'role_id' => $role->id]));
        $this->getJson($second['path'])->assertOk();
        $this->getJson('/api/v1/operations/context')->assertOk()->assertJsonCount(2, 'branches')->assertJsonMissingPath('branches.0.address');
        $this->getJson('/api/v1/branches')->assertForbidden();
        $this->postJson($second['path'], $this->payload(1))->assertForbidden();
        DB::table('role_permission')->where('role_id', $first['owner']->role_id)->where('permission_id', DB::table('permissions')->where('key', 'catalog.manage')->value('id'))->delete();
        $this->actingAs($first['owner']->fresh());
        $this->postJson($first['path'], $payload)->assertForbidden();
    }

    public function test_audit_failure_rolls_back_context_price_product_revision_and_uuid(): void
    {
        $work = $this->work();
        $records = DB::table('idempotency_records')->count();
        Event::listen('eloquent.creating: '.AuditLog::class, function ($log) {
            if ($log->action === 'catalog.context_price.created') {
                throw new \RuntimeException('Auditoría de precio fallida');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson($work['path'], $this->payload(1));
            $this->fail('El precio exige auditoría atómica.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Auditoría de precio fallida', $error->getMessage());
        }
        $this->assertDatabaseCount('product_context_prices', 0);
        $this->assertDatabaseCount('idempotency_records', $records);
        $this->assertDatabaseHas('products', ['id' => $work['product']['id'], 'revision' => 1]);
    }
}
