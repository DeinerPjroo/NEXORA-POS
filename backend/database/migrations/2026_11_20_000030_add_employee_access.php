<?php

use App\Domains\Identity\EmployeeRoles;
use App\Domains\Identity\PermissionCatalog;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $export = DB::connection()->pretending();
        if ($export || ! Schema::hasColumn('users', 'employee_revision')) {
            Schema::table('users', fn (Blueprint $t) => $t->unsignedInteger('employee_revision')->default(1));
        }
        // Preserve existing access; newly enrolled employees receive explicit branches.
        if ($export || ! Schema::hasColumn('users', 'all_branches')) {
            Schema::table('users', fn (Blueprint $t) => $t->boolean('all_branches')->default(true));
        }
        if ($export || ! Schema::hasColumn('roles', 'revision')) {
            Schema::table('roles', fn (Blueprint $t) => $t->unsignedInteger('revision')->default(1));
        }
        if ($export || ! Schema::hasTable('employee_branches')) {
            Schema::create('employee_branches', function (Blueprint $t) {
                $t->unsignedBigInteger('tenant_id');
                $t->unsignedBigInteger('user_id');
                $t->unsignedBigInteger('branch_id');
                $t->primary(['tenant_id', 'user_id', 'branch_id']);
                $t->foreign(['tenant_id', 'user_id'])->references(['tenant_id', 'id'])->on('users')->restrictOnDelete();
                $t->foreign(['tenant_id', 'branch_id'])->references(['tenant_id', 'id'])->on('branches')->restrictOnDelete();
            });
        }
        if ($export) {
            return;
        }
        DB::transaction(function () {
            PermissionCatalog::seed();
            $permissions = DB::table('permissions')->whereIn('key', ['team.manage', 'team.credentials'])->pluck('id');
            foreach (DB::table('roles')->where('is_owner', true)->get() as $role) {
                foreach ($permissions as $id) {
                    DB::table('role_permission')->insertOrIgnore(['tenant_id' => $role->tenant_id, 'role_id' => $role->id, 'permission_id' => $id]);
                }
            }
            foreach (DB::table('tenants')->pluck('id') as $tenantId) {
                foreach (EmployeeRoles::PRESETS as $name => $keys) {
                    $role = DB::table('roles')->where('tenant_id', $tenantId)->where('name', $name)->first();
                    if (! $role) {
                        $id = DB::table('roles')->insertGetId(['tenant_id' => $tenantId, 'name' => $name, 'is_owner' => false, 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
                    } else {
                        $old = DB::table('role_permission')->where('role_id', $role->id)->join('permissions', 'permissions.id', '=', 'permission_id')->pluck('key')->all();
                        if ($role->is_owner || $old !== ['dashboard.view']) {
                            continue;
                        }
                        $id = $role->id;
                        DB::table('role_permission')->where('role_id', $id)->delete();
                    }
                    foreach (DB::table('permissions')->whereIn('key', $keys)->pluck('id') as $permissionId) {
                        DB::table('role_permission')->insert(['tenant_id' => $tenantId, 'role_id' => $id, 'permission_id' => $permissionId]);
                    }
                }
            }
        });
    }

    public function down(): void
    {
        throw new LogicException('Conservar asignaciones e historia de acceso.');
    }
};
