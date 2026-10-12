<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class TeacherAttendanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_in_and_out_update_one_daily_record_and_reject_duplicates(): void
    {
        $user = $this->userWith('kurikulum', ['absen-masuk', 'absen-pulang']);
        $this->setGeofence();
        $this->actingAs($user, 'sanctum');
        $payload = [
            'latitude' => 0,
            'longitude' => 0,
            'accuracy' => 5,
            'photo' => \Illuminate\Http\UploadedFile::fake()->image('checkin.jpg', 1200, 800),
            'liveness_type' => 'BLINK',
        ];

        $this->postJson('/api/v1/teacher/attendance/check-in', $payload)->assertCreated();
        $this->assertDatabaseCount('absensis', 1);
        $this->postJson('/api/v1/teacher/attendance/check-in', $payload)->assertUnprocessable();
        $this->postJson('/api/v1/teacher/attendance/check-out', $payload)->assertOk();
        $this->assertDatabaseCount('absensis', 1);
        $this->assertDatabaseHas('absensis', ['user_id' => $user->id, 'status_verifikasi_masuk' => 'PENDING']);
        $this->assertDatabaseHas('absensis', ['user_id' => $user->id, 'status_verifikasi_pulang' => 'PENDING']);
    }

    public function test_non_strict_geofence_flags_and_admin_review_records_actor(): void
    {
        $teacher = $this->userWith('guru', ['absen-masuk', 'absen-pulang']);
        $admin = $this->userWith('admin', ['review-absensi-flagged']);
        $this->setGeofence(strict: false);

        $this->actingAs($teacher, 'sanctum')->postJson('/api/v1/teacher/attendance/check-in', $this->attendanceCheckInPayload(['latitude' => 1, 'longitude' => 1]))->assertCreated();
        $this->assertDatabaseHas('absensis', ['user_id' => $teacher->id, 'status_verifikasi_masuk' => 'FLAGGED']);

        $attendance = \App\Models\Absensi::query()->firstOrFail();
        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/flagged-attendances/{$attendance->id}/review", [
            'session' => 'masuk', 'decision' => 'APPROVED', 'note' => 'Lokasi telah diverifikasi.',
        ])->assertOk();

        $this->assertDatabaseHas('absensis', ['id' => $attendance->id, 'status_verifikasi_masuk' => 'APPROVED', 'approved_by' => $admin->id]);
    }

    public function test_strict_geofence_rejects_outside_location_without_record(): void
    {
        $user = $this->userWith('guru', ['absen-masuk']);
        $this->setGeofence(strict: true);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/teacher/attendance/check-in', $this->attendanceCheckInPayload(['latitude' => 1, 'longitude' => 1]))->assertUnprocessable();
        $this->assertDatabaseCount('absensis', 0);
    }

    public function test_attendance_is_blocked_until_school_coordinates_are_verified(): void
    {
        $user = $this->userWith('guru', ['absen-masuk']);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/teacher/attendance/check-in', $this->attendanceCheckInPayload(['latitude' => 0, 'longitude' => 0]))
            ->assertStatus(503);
        $this->assertDatabaseCount('absensis', 0);
    }

    private function setGeofence(bool $strict = true): void
    {
        foreach ([
            ['geofence_latitude', '0'], ['geofence_longitude', '0'], ['geofence_radius_meters', '100'], ['geofence_location_verified', '1'], ['is_geofence_strict', $strict ? '1' : '0'], ['jam_masuk_batas', '23:59:59'],
        ] as [$key, $value]) {
            Setting::query()->create(['key' => $key, 'value' => $value, 'group' => 'test', 'type' => 'string', 'label' => $key]);
        }
    }

    private function attendanceCheckInPayload(array $overrides = []): array
    {
        return array_merge([
            'latitude' => 0,
            'longitude' => 0,
            'accuracy' => 5,
            'photo' => \Illuminate\Http\UploadedFile::fake()->image('attendance.jpg', 1200, 800),
            'liveness_type' => 'BLINK',
        ], $overrides);
    }

    private function userWith(string $roleName, array $permissionNames): User
    {
        $role = Role::query()->firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
        foreach ($permissionNames as $name) {
            $permission = Permission::query()->firstOrCreate(['name' => $name, 'guard_name' => 'web']);
            $role->givePermissionTo($permission);
        }
        $user = User::query()->create(['nama' => 'Test '.$roleName, 'email' => $roleName.'@test.local', 'password' => 'test-password-123']);
        $user->assignRole($role);

        return $user;
    }
}
