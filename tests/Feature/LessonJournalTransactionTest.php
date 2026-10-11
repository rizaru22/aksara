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

class LessonJournalTransactionTest extends TestCase
{
    use RefreshDatabase;

    public function test_journal_and_complete_student_attendance_are_created_together(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $this->actingAs($teacher, 'sanctum');

        $this->postJson('/api/v1/lesson-journals', [
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pembahasan' => 'Pengenalan basis data relasional dan primary key.',
            'presensi' => $students->map(fn (Siswa $student) => ['siswa_id' => $student->id, 'status' => 'HADIR'])->all(),
        ])->assertCreated();

        $this->assertDatabaseCount('jurnal_mengajars', 1);
        $this->assertDatabaseCount('presensi_siswas', 2);
        $this->assertDatabaseHas('jurnal_mengajars', ['jadwal_pelajaran_id' => $schedule->id, 'status_sesi' => 'selesai']);
    }

    public function test_incomplete_or_cross_class_roster_is_rejected_without_partial_records(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $this->actingAs($teacher, 'sanctum')->postJson('/api/v1/lesson-journals', [
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pembahasan' => 'Pengenalan basis data relasional dan primary key.',
            'presensi' => [['siswa_id' => $students->first()->id, 'status' => 'HADIR']],
        ])->assertUnprocessable();

        $this->assertDatabaseCount('jurnal_mengajars', 0);
        $this->assertDatabaseCount('presensi_siswas', 0);
    }

    private function prepareSession(): array
    {
        $permission = Permission::query()->firstOrCreate(['name' => 'isi-ejurnal', 'guard_name' => 'web']);
        $role = Role::query()->firstOrCreate(['name' => 'guru', 'guard_name' => 'web']);
        $role->givePermissionTo($permission);
        $teacher = User::query()->create(['nama' => 'Guru Test', 'email' => 'guru@test.local', 'password' => 'test-password-123']);
        $teacher->assignRole($role);
        $year = TahunAjaran::query()->create(['tahun_ajaran' => '2026/2027', 'is_active' => true]);
        Setting::query()->create(['key' => 'active_tahun_ajaran', 'value' => $year->tahun_ajaran, 'group' => 'academic', 'type' => 'string', 'label' => 'Tahun aktif']);
        Setting::query()->create(['key' => 'semester_start_date', 'value' => '2026-07-13', 'group' => 'academic', 'type' => 'date', 'label' => 'Awal semester']);
        $class = Kelas::query()->create(['nama_kelas' => 'X RPL Test', 'tingkat' => 'X', 'jurusan' => 'RPL']);
        $subject = MataPelajaran::query()->create(['kode_mapel' => 'DB-TEST', 'nama_mapel' => 'Basis Data']);
        $now = Carbon::now(config('app.timezone'));
        $semester = $now->month >= 7 ? 'Ganjil' : 'Genap';
        $schedule = JadwalPelajaran::query()->create([
            'tahun_ajaran_id' => $year->id,
            'semester' => $semester,
            'user_id' => $teacher->id,
            'kelas_id' => $class->id,
            'mata_pelajaran_id' => $subject->id,
            'siklus_minggu' => null,
            'hari' => app(CycleScheduleService::class)->getHariIndo($now),
            'jam_mulai' => $now->copy()->subMinutes(15)->format('H:i'),
            'jam_selesai' => $now->copy()->addMinutes(20)->format('H:i'),
        ]);
        $students = collect([
            Siswa::query()->create(['nisn' => 'TEST000001', 'nama' => 'Siswa Satu', 'kelas_id' => $class->id, 'jenis_kelamin' => 'L']),
            Siswa::query()->create(['nisn' => 'TEST000002', 'nama' => 'Siswa Dua', 'kelas_id' => $class->id, 'jenis_kelamin' => 'P']),
        ]);

        return [$teacher, $schedule, $students];
    }
}
