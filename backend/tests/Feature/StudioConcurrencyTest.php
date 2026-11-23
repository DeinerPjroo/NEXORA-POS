<?php

namespace Tests\Feature;

use App\Domains\Identity\PermissionCatalog;
use App\Domains\Identity\RegisterCompany;
use App\Domains\Studio\PosLayoutSchema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\SqlConcurrencyTestCase;

class StudioConcurrencyTest extends SqlConcurrencyTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->requireSql();
        PermissionCatalog::seed();
    }

    private function actor()
    {
        $actor = app(RegisterCompany::class)->execute(['company_name' => 'Studio SQL', 'business_type' => 'restaurant', 'branch_name' => 'Principal', 'name' => 'Ana', 'email' => 'studio-sql@example.test', 'password' => 'SeguraNexora123']);
        $this->actingAs($actor)->withHeader('Origin', 'http://127.0.0.1:5173');

        return $actor;
    }

    public function test_studio_concurrent_identical_uuid_creates_one_draft_and_competing_edit_rejects_stale_revision(): void
    {
        $actor = $this->actor();
        $data = ['idempotency_key' => (string) Str::uuid(), 'revision' => 0, 'configuration' => PosLayoutSchema::defaults()];
        $job = ['operation' => 'studio.save', 'actor_id' => $actor->id, 'resource_id' => 0, 'data' => $data];
        $this->assertSame([true, true], array_column($this->race([$job, $job]), 'accepted'));
        $this->assertDatabaseCount('studio_layouts', 1);
        $job['data'] = [...$data, 'idempotency_key' => (string) Str::uuid(), 'revision' => 1];
        $other = $job;
        $other['data']['idempotency_key'] = (string) Str::uuid();
        $accepted = array_column($this->race([$job, $other]), 'accepted');
        sort($accepted);
        $this->assertSame([false, true], $accepted);
        $this->assertDatabaseHas('studio_layouts', ['revision' => 2, 'published' => null]);
    }

    public function test_studio_publish_racing_draft_cannot_publish_unreviewed_configuration(): void
    {
        $actor = $this->actor();
        $this->postJson('/api/v1/studio/pos/draft', ['idempotency_key' => (string) Str::uuid(), 'revision' => 0, 'configuration' => PosLayoutSchema::defaults()])->assertOk();
        $next = PosLayoutSchema::defaults();
        $next['tokens']['accent'] = '#112233';
        $jobs = [
            ['operation' => 'studio.publish', 'actor_id' => $actor->id, 'resource_id' => 0, 'data' => ['idempotency_key' => (string) Str::uuid(), 'revision' => 1]],
            ['operation' => 'studio.save', 'actor_id' => $actor->id, 'resource_id' => 0, 'data' => ['idempotency_key' => (string) Str::uuid(), 'revision' => 1, 'configuration' => $next]],
        ];
        $results = $this->race($jobs);
        $accepted = array_column($results, 'accepted');
        sort($accepted);
        $this->assertSame([false, true], $accepted);
        $row = DB::table('studio_layouts')->first();
        $this->assertSame(2, $row->revision);
        $this->assertTrue($row->published === null || json_decode($row->published, true)['tokens']['accent'] === '#7258df');
    }
}
