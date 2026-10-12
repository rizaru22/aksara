<?php

namespace Tests\Feature;

use App\Models\JadwalPelajaran;
use App\Models\Kelas;
use App\Models\MataPelajaran;
use App\Models\Setting;
use App\Models\Siswa;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Services\CycleScheduleService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class SubstituteTeacherRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_primary_teacher_can_request_substitute_and_substitute_can_fill_journal_for_that_day_only(): void
    {
        [$primaryTeacher, $substituteTeacher, $schedule, $students] = $this->prepareSubstituteScenario();
        $today = Carbon::now(config('app.timezone'))->toDateString();

        $this->actingAs($primaryTeacher, 'sanctum')
            ->postJson('/api/v1/teacher/substitute-requests', [
                'jadwal_pelajaran_id' => $schedule->id,
                'tanggal' => $today,
                'guru_pengganti_id' => $substituteTeacher->id,
                'alasan' => 'Guru utama sedang sakit dan harus istirahat.',
            ])
            ->assertCreated();

        $request = \App\Models\PengajuanGuruPengganti::query()->firstOrFail();

        $this->actingAs($this->adminUser(), 'sanctum')
            ->patchJson('/api/v1/admin/substitute-requests/'.$request->id, [
                'status_approval' => 'APPROVED',
                'catatan_admin' => 'Disetujui untuk hari ini.',
            ])
            ->assertOk();

        $response = $this->actingAs($substituteTeacher, 'sanctum')
            ->getJson('/api/v1/teacher/schedules/today');
        $response->assertOk();
        $this->assertTrue(collect($response->json('data'))->contains(fn ($scheduleData) => ($scheduleData['id'] ?? null) === $schedule->id && ($scheduleData['substitute_active'] ?? false) === true));

        $this->actingAs($substituteTeacher, 'sanctum')
            ->postJson('/api/v1/lesson-journals', [
                'jadwal_pelajaran_id' => $schedule->id,
                'materi_pembahasan' => 'Materi digantikan oleh guru pengganti untuk sesi hari ini.',
                'presensi' => $students->map(fn (Siswa $student) => ['siswa_id' => $student->id, 'status' => 'HADIR'])->all(),
            ])
            ->assertCreated();

        $this->assertDatabaseHas('jurnal_mengajars', [
            'jadwal_pelajaran_id' => $schedule->id,
            'user_id' => $primaryTeacher->id,
            'guru_pengganti_id' => $substituteTeacher->id,
            'status_sesi' => 'berlangsung',
        ]);
    }

    public function test_primary_teacher_can_fetch_substitute_candidates_excluding_self(): void
    {
        [$primaryTeacher, $substituteTeacher] = $this->prepareSubstituteScenario();

        $response = $this->actingAs($primaryTeacher, 'sanctum')
            ->getJson('/api/v1/teacher/substitute-candidates');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($substituteTeacher->id));
        $this->assertFalse($ids->contains($primaryTeacher->id));
    }


    private function prepareSubstituteScenario(): array
    {
        $permission = Permission::query()->firstOrCreate(['name' => 'isi-ejurnal', 'guard_name' => 'web']);
        $role = Role::query()->firstOrCreate(['name' => 'guru', 'guard_name' => 'web']);
        $role->givePermissionTo($permission);
        Role::query()->firstOrCreate(['name' => 'kurikulum', 'guard_name' => 'web']);
        Role::query()->firstOrCreate(['name' => 'kepsek', 'guard_name' => 'web']);

        $primaryTeacher = User::query()->create(['nama' => 'Guru Utama', 'email' => 'guru.utama@test.local', 'password' => 'test-password-123']);
        $primaryTeacher->assignRole($role);

        $substituteTeacher = User::query()->create(['nama' => 'Guru Pengganti', 'email' => 'guru.pengganti@test.local', 'password' => 'test-password-123']);
        $substituteTeacher->assignRole($role);

        $year = TahunAjaran::query()->create(['tahun_ajaran' => '2026/2027', 'is_active' => true]);
        Setting::query()->create(['key' => 'active_tahun_ajaran', 'value' => $year->tahun_ajaran, 'group' => 'academic', 'type' => 'string', 'label' => 'Tahun aktif']);
        Setting::query()->create(['key' => 'semester_start_date', 'value' => '2026-07-13', 'group' => 'academic', 'type' => 'date', 'label' => 'Awal semester']);

        $class = Kelas::query()->create(['nama_kelas' => 'XI RPL', 'tingkat' => 'XI', 'jurusan' => 'RPL']);
        $subject = MataPelajaran::query()->create(['kode_mapel' => 'WEB-TEST', 'nama_mapel' => 'Pemrograman Web']);
        $today = Carbon::now(config('app.timezone'));
        $semester = $today->month >= 7 ? 'Ganjil' : 'Genap';
        $schedule = JadwalPelajaran::query()->create([
            'tahun_ajaran_id' => $year->id,
            'semester' => $semester,
            'user_id' => $primaryTeacher->id,
            'kelas_id' => $class->id,
            'mata_pelajaran_id' => $subject->id,
            'siklus_minggu' => null,
            'hari' => app(CycleScheduleService::class)->getHariIndo($today),
            'jam_mulai' => $today->copy()->subMinutes(15)->format('H:i'),
            'jam_selesai' => $today->copy()->addMinutes(20)->format('H:i'),
        ]);

        $students = collect([
            Siswa::query()->create(['nisn' => 'SUB000001', 'nama' => 'Siswa Pengganti 1', 'kelas_id' => $class->id, 'jenis_kelamin' => 'L']),
            Siswa::query()->create(['nisn' => 'SUB000002', 'nama' => 'Siswa Pengganti 2', 'kelas_id' => $class->id, 'jenis_kelamin' => 'P']),
        ]);

        return [$primaryTeacher, $substituteTeacher, $schedule, $students];
    }

    private function adminUser(): User
    {
        $permAdmin = Permission::query()->firstOrCreate(['name' => 'kelola-master-data', 'guard_name' => 'web']);
        $roleAdmin = Role::query()->firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $roleAdmin->givePermissionTo($permAdmin);

        $admin = User::query()->create(['nama' => 'Admin Sistem', 'email' => 'admin@test.local', 'password' => 'test-password-123']);
        $admin->assignRole($roleAdmin);

        return $admin;
    }
}
