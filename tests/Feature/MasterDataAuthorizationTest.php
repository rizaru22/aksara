<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class MasterDataAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_curriculum_can_manage_academic_data_but_teacher_cannot(): void
    {
        $curriculum = $this->userFor('kurikulum', 'kelola-master-data');
        $teacher = $this->userFor('guru', 'isi-ejurnal');

        $this->actingAs($curriculum, 'sanctum')->getJson('/api/v1/academic/classes')->assertOk();
        $this->actingAs($teacher, 'sanctum')->getJson('/api/v1/academic/classes')->assertForbidden();
    }

    public function test_admin_user_management_is_not_granted_to_curriculum_by_shared_master_permission(): void
    {
        $curriculum = $this->userFor('kurikulum', 'kelola-master-data');

        $this->actingAs($curriculum, 'sanctum')->getJson('/api/v1/admin/users')->assertForbidden();
    }

    private function userFor(string $roleName, string $permissionName): User
    {
        $permission = Permission::query()->firstOrCreate(['name' => $permissionName, 'guard_name' => 'web']);
        $role = Role::query()->firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
        $role->givePermissionTo($permission);
        $user = User::query()->create(['nama' => $roleName, 'email' => $roleName.'@authorization.test', 'password' => 'test-password-123']);
        $user->assignRole($role);

        return $user;
    }
}
