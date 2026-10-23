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

    public function test_journal_and_complete_student_attendance_are_created_as_draft(): void
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
        $this->assertDatabaseHas('jurnal_mengajars', ['jadwal_pelajaran_id' => $schedule->id, 'status_sesi' => 'draft']);
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

    public function test_journal_can_be_updated_after_class_window_when_draft_is_still_open(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $this->actingAs($teacher, 'sanctum');

        $draftId = $this->postJson('/api/v1/lesson-journals', [
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pembahasan' => 'Pengenalan basis data relasional dan primary key.',
            'presensi' => $students->map(fn (Siswa $student) => ['siswa_id' => $student->id, 'status' => 'HADIR'])->all(),
        ])->assertCreated()->json('data.id');

        $schedule->update([
            'jam_mulai' => Carbon::now(config('app.timezone'))->copy()->subHours(2)->format('H:i'),
            'jam_selesai' => Carbon::now(config('app.timezone'))->copy()->subMinutes(5)->format('H:i'),
        ]);

        $this->postJson('/api/v1/lesson-journals', [
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pembahasan' => 'Pengenalan basis data relasional dan primary key. Perbaikan catatan setelah jam berakhir.',
            'presensi' => $students->map(fn (Siswa $student) => ['siswa_id' => $student->id, 'status' => 'HADIR'])->all(),
        ])->assertOk();

        $this->assertDatabaseHas('jurnal_mengajars', ['id' => $draftId, 'status_sesi' => 'draft']);
        $this->assertDatabaseHas('jurnal_mengajars', ['id' => $draftId, 'materi_pembahasan' => 'Pengenalan basis data relasional dan primary key. Perbaikan catatan setelah jam berakhir.']);
    }

    public function test_open_draft_remains_finalize_ready_after_schedule_window(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $this->actingAs($teacher, 'sanctum');

        $this->postJson('/api/v1/lesson-journals', [
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pembahasan' => 'Pengenalan basis data relasional dan primary key.',
            'presensi' => $students->map(fn (Siswa $student) => ['siswa_id' => $student->id, 'status' => 'HADIR'])->all(),
        ])->assertCreated();

        $schedule->update([
            'jam_mulai' => Carbon::now(config('app.timezone'))->copy()->subHours(2)->format('H:i'),
            'jam_selesai' => Carbon::now(config('app.timezone'))->copy()->subMinutes(5)->format('H:i'),
        ]);

        $this->getJson('/api/v1/teacher/schedules/today')
            ->assertOk()
            ->assertJsonPath('data.0.can_finalize_journal', true);
    }

    public function test_teacher_can_list_all_journal_history_with_status_filters(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $this->actingAs($teacher, 'sanctum');

        $draftDate = Carbon::now(config('app.timezone'))->copy()->subDay();
        $finalDate = Carbon::now(config('app.timezone'))->copy()->subDays(2);

        $draft = \App\Models\JurnalMengajar::query()->create([
            'user_id' => $teacher->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pelajaran_id' => null,
            'tanggal' => $draftDate->toDateString(),
            'materi_pembahasan' => 'Rencana pembelajaran hari sebelumnya.',
            'status_sesi' => 'draft',
        ]);

        $students->each(fn (Siswa $student) => $draft->presensiSiswas()->create([
            'siswa_id' => $student->id,
            'status' => 'HADIR',
        ]));

        $final = \App\Models\JurnalMengajar::query()->create([
            'user_id' => $teacher->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pelajaran_id' => null,
            'tanggal' => $finalDate->toDateString(),
            'materi_pembahasan' => 'Pembelajaran yang sudah diselesaikan.',
            'status_sesi' => 'final',
            'foto_kegiatan' => 'lesson-journals/final.jpg',
            'jam_mulai_realisasi' => $finalDate->copy()->setTime(8, 0)->toDateTimeString(),
            'jam_selesai_realisasi' => $finalDate->copy()->setTime(9, 0)->toDateTimeString(),
        ]);

        $students->each(fn (Siswa $student) => $final->presensiSiswas()->create([
            'siswa_id' => $student->id,
            'status' => 'HADIR',
        ]));

        $this->getJson('/api/v1/lesson-journals?status=all')
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonFragment(['status_sesi' => 'draft'])
            ->assertJsonFragment(['status_sesi' => 'final']);

        $this->getJson('/api/v1/lesson-journals?status=draft')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.status_sesi', 'draft');
    }

    public function test_finalization_reports_location_issue_before_time_window_message(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $now = Carbon::now(config('app.timezone'));
        $schedule->update([
            'jam_mulai' => $now->copy()->subMinutes(15)->format('H:i'),
            'jam_selesai' => $now->copy()->addMinutes(40)->format('H:i'),
        ]);

        Setting::query()->updateOrCreate(['key' => 'geofence_location_verified'], ['value' => '1', 'group' => 'school', 'type' => 'boolean', 'label' => 'Lokasi sekolah diverifikasi']);
        Setting::query()->updateOrCreate(['key' => 'geofence_latitude'], ['value' => '0.00000000', 'group' => 'school', 'type' => 'decimal', 'label' => 'Lintang sekolah']);
        Setting::query()->updateOrCreate(['key' => 'geofence_longitude'], ['value' => '0.00000000', 'group' => 'school', 'type' => 'decimal', 'label' => 'Bujur sekolah']);
        Setting::query()->updateOrCreate(['key' => 'geofence_radius_meters'], ['value' => '100', 'group' => 'school', 'type' => 'integer', 'label' => 'Radius geofence']);

        $this->actingAs($teacher, 'sanctum');
        $draftId = $this->postJson('/api/v1/lesson-journals', [
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pembahasan' => 'Pengenalan basis data relasional dan primary key.',
            'presensi' => $students->map(fn (Siswa $student) => ['siswa_id' => $student->id, 'status' => 'HADIR'])->all(),
        ])->assertCreated()->json('data.id');

        $schedule->update([
            'jam_mulai' => $now->copy()->subHours(2)->format('H:i'),
            'jam_selesai' => $now->copy()->subMinutes(5)->format('H:i'),
        ]);

        $response = $this->postJson('/api/v1/lesson-journals/'.$draftId.'/finalize', [
            'foto_kegiatan' => \Illuminate\Http\UploadedFile::fake()->image('journal.jpg', 1200, 800),
            'latitude' => 10.0000,
            'longitude' => 10.0000,
            'accuracy' => 1,
        ]);

        $response->assertUnprocessable();
        $this->assertStringContainsString('Finalisasi harus dilakukan di area sekolah.', $response->json('message'));
    }

    public function test_journal_can_be_finalized_outside_normal_window_when_emergency_is_declared(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $now = Carbon::now(config('app.timezone'));
        $schedule->update([
            'jam_mulai' => $now->copy()->subMinutes(15)->format('H:i'),
            'jam_selesai' => $now->copy()->addMinutes(40)->format('H:i'),
        ]);

        Setting::query()->updateOrCreate(['key' => 'geofence_location_verified'], ['value' => '1', 'group' => 'school', 'type' => 'boolean', 'label' => 'Lokasi sekolah diverifikasi']);
        Setting::query()->updateOrCreate(['key' => 'geofence_latitude'], ['value' => '0.00000000', 'group' => 'school', 'type' => 'decimal', 'label' => 'Lintang sekolah']);
        Setting::query()->updateOrCreate(['key' => 'geofence_longitude'], ['value' => '0.00000000', 'group' => 'school', 'type' => 'decimal', 'label' => 'Bujur sekolah']);
        Setting::query()->updateOrCreate(['key' => 'geofence_radius_meters'], ['value' => '100', 'group' => 'school', 'type' => 'integer', 'label' => 'Radius geofence']);

        $this->actingAs($teacher, 'sanctum');
        $draftId = $this->postJson('/api/v1/lesson-journals', [
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pembahasan' => 'Pengenalan basis data relasional dan primary key.',
            'presensi' => $students->map(fn (Siswa $student) => ['siswa_id' => $student->id, 'status' => 'HADIR'])->all(),
        ])->assertCreated()->json('data.id');

        $this->postJson('/api/v1/lesson-journals/'.$draftId.'/finalize', [
            'foto_kegiatan' => \Illuminate\Http\UploadedFile::fake()->image('journal.jpg', 1200, 800),
            'latitude' => 0.0001,
            'longitude' => 0.0001,
            'accuracy' => 1,
            'darurat' => true,
            'catatan_penutupan' => 'Guru harus meninggalkan kelas karena bencana alam lokal.',
        ])->assertOk();

        $this->assertDatabaseHas('jurnal_mengajars', ['id' => $draftId, 'status_sesi' => 'final']);
    }

    public function test_teacher_can_finalize_late_without_new_photo_or_gps_within_48_hours(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $now = Carbon::now(config('app.timezone'));
        $schedule->update([
            'jam_mulai' => $now->copy()->subHours(2)->format('H:i'),
            'jam_selesai' => $now->copy()->subMinutes(5)->format('H:i'),
        ]);

        $journal = \App\Models\JurnalMengajar::query()->create([
            'user_id' => $teacher->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'tanggal' => $now->toDateString(),
            'materi_pembahasan' => 'Materi pembelajaran yang belum difinalisasi.',
            'status_sesi' => 'draft',
        ]);
        $journal->created_at = $now->copy()->subHour();
        $journal->save();
        $students->each(fn (Siswa $student) => $journal->presensiSiswas()->create([
            'siswa_id' => $student->id,
            'status' => 'HADIR',
        ]));

        $this->actingAs($teacher, 'sanctum')
            ->postJson('/api/v1/lesson-journals/'.$journal->id.'/finalize', [
                'finalisasi_susulan' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.status_sesi', 'finalisasi_susulan');

        $this->assertDatabaseHas('jurnal_mengajars', [
            'id' => $journal->id,
            'status_sesi' => 'finalisasi_susulan',
            'foto_kegiatan' => null,
            'lat_finalisasi' => null,
            'long_finalisasi' => null,
        ]);
    }

    public function test_draft_older_than_48_hours_becomes_expired_and_cannot_be_finalized(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $now = Carbon::now(config('app.timezone'));
        $schedule->update(['jam_selesai' => $now->copy()->subMinutes(5)->format('H:i')]);

        $journal = \App\Models\JurnalMengajar::query()->create([
            'user_id' => $teacher->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'tanggal' => $now->toDateString(),
            'materi_pembahasan' => 'Draf yang telah kedaluwarsa.',
            'status_sesi' => 'draft',
        ]);
        $journal->created_at = $now->copy()->subHours(49);
        $journal->save();
        $students->each(fn (Siswa $student) => $journal->presensiSiswas()->create([
            'siswa_id' => $student->id,
            'status' => 'HADIR',
        ]));

        $this->actingAs($teacher, 'sanctum')
            ->postJson('/api/v1/lesson-journals/'.$journal->id.'/finalize', [
                'finalisasi_susulan' => true,
            ])
            ->assertStatus(409);

        $this->assertDatabaseHas('jurnal_mengajars', [
            'id' => $journal->id,
            'status_sesi' => 'kedaluwarsa',
        ]);
    }

    public function test_admin_can_bulk_expire_drafts_older_than_48_hours(): void
    {
        [$teacher, $schedule] = $this->prepareSession();
        $now = Carbon::now(config('app.timezone'));
        $journal = \App\Models\JurnalMengajar::query()->create([
            'user_id' => $teacher->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'tanggal' => $now->toDateString(),
            'materi_pembahasan' => 'Draf untuk pengujian kedaluwarsa massal.',
            'status_sesi' => 'draft',
        ]);
        $journal->created_at = $now->copy()->subHours(49);
        $journal->save();

        $admin = User::query()->create([
            'nama' => 'Admin Kedaluwarsa',
            'email' => 'admin.expiry@test.local',
            'password' => 'test-password-123',
        ]);
        $adminRole = Role::query()->firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $admin->assignRole($adminRole);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/journal-monitoring/expire-drafts')
            ->assertOk()
            ->assertJsonPath('expired_count', 1);

        $this->assertDatabaseHas('jurnal_mengajars', [
            'id' => $journal->id,
            'status_sesi' => 'kedaluwarsa',
        ]);
    }

    public function test_admin_journal_detail_exposes_student_attendance_alias_used_by_ui(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $this->actingAs($teacher, 'sanctum');

        $journal = \App\Models\JurnalMengajar::query()->create([
            'user_id' => $teacher->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pelajaran_id' => null,
            'tanggal' => Carbon::now(config('app.timezone'))->toDateString(),
            'materi_pembahasan' => 'Materi monitoring admin',
            'status_sesi' => 'final',
        ]);

        $students->each(fn (Siswa $student) => $journal->presensiSiswas()->create([
            'siswa_id' => $student->id,
            'status' => 'HADIR',
            'keterangan' => 'hadir',
        ]));

        $admin = User::query()->create([
            'nama' => 'Admin Monitoring',
            'email' => 'admin.monitoring@test.local',
            'password' => 'test-password-123',
        ]);
        $adminRole = Role::query()->firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $admin->assignRole($adminRole);

        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/admin/journal-monitoring/'.$journal->id)
            ->assertOk()
            ->assertJsonPath('data.presensi.0.nama', 'Siswa Satu')
            ->assertJsonPath('data.presensi_siswas.0.nama', 'Siswa Satu');
    }

    public function test_admin_student_attendance_report_can_be_filtered_by_month_and_class(): void
    {
        [$teacher, $schedule, $students] = $this->prepareSession();
        $class = $schedule->kelas;
        $month = Carbon::now(config('app.timezone'))->format('Y-m');
        $firstDate = Carbon::createFromFormat('Y-m', $month, config('app.timezone'))->startOfMonth()->addDay();

        $firstJournal = \App\Models\JurnalMengajar::query()->create([
            'user_id' => $teacher->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pelajaran_id' => null,
            'tanggal' => $firstDate->toDateString(),
            'materi_pembahasan' => 'Pertemuan 1',
            'status_sesi' => 'final',
        ]);

        $firstJournal->presensiSiswas()->create(['siswa_id' => $students[0]->id, 'status' => 'HADIR', 'keterangan' => 'hadir']);
        $firstJournal->presensiSiswas()->create(['siswa_id' => $students[1]->id, 'status' => 'IZIN', 'keterangan' => 'izin']);

        $secondJournal = \App\Models\JurnalMengajar::query()->create([
            'user_id' => $teacher->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'materi_pelajaran_id' => null,
            'tanggal' => $firstDate->copy()->addDay()->toDateString(),
            'materi_pembahasan' => 'Pertemuan 2',
            'status_sesi' => 'final',
        ]);

        $secondJournal->presensiSiswas()->create(['siswa_id' => $students[0]->id, 'status' => 'HADIR', 'keterangan' => 'hadir']);
        $secondJournal->presensiSiswas()->create(['siswa_id' => $students[1]->id, 'status' => 'SAKIT', 'keterangan' => 'sakit']);

        $admin = User::query()->create([
            'nama' => 'Admin Laporan Siswa',
            'email' => 'admin.student.report@test.local',
            'password' => 'test-password-123',
        ]);
        $adminRole = Role::query()->firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $admin->assignRole($adminRole);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/reports/student-attendance?month='.$month.'&class_id='.$class->id)
            ->assertOk()
            ->assertJsonPath('data.summary.total_students', 2)
            ->assertJsonPath('data.summary.by_status.HADIR', 2)
            ->assertJsonPath('data.summary.by_status.IZIN', 1)
            ->assertJsonPath('data.summary.by_status.SAKIT', 1)
            ->assertJsonPath('data.summary.by_status.ALPHA', 0)
            ->assertJsonPath('data.students.0.present_count', 0)
            ->assertJsonPath('data.students.0.izin_count', 1)
            ->assertJsonPath('data.students.0.sick_count', 1)
            ->assertJsonPath('data.students.1.present_count', 2);
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
