<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Absensi;
use App\Models\AgendaSekolah;
use App\Models\HariLibur;
use App\Models\JadwalPelajaran;
use App\Models\JurnalMengajar;
use App\Models\PengajuanGuruPengganti;
use App\Models\PengajuanIzin;
use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Services\ActiveAcademicYearService;
use App\Services\CycleScheduleService;
use App\Services\KalenderJamPelajaranResolver;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class DashboardController extends Controller
{
    /**
     * Endpoint GET /api/v1/dashboard/admin/live.
     * Mengambil status real-time admin tentang kehadiran guru, cuti, sakit, review presensi, dan sesi pembelajaran yang sedang berjalan.
     */
    public function adminLive(Request $request, CycleScheduleService $cycles, ActiveAcademicYearService $academicYears, KalenderJamPelajaranResolver $calendarResolver)
    {
        abort_unless($request->user()->hasRole('admin') || $request->user()->can('view-dashboard-kurikulum'), 403);

        $now = now(config('app.timezone'));
        $date = $now->toDateString();
        $holiday = HariLibur::query()->whereDate('tanggal', $date)->first();
        if (! $holiday && $now->isSunday()) {
            $holiday = (object) ['nama' => 'Hari Minggu', 'jenis' => 'MINGGU'];
        }
        $teachers = User::role(['guru', 'tendik', 'admin', 'kurikulum', 'kepsek'])->orderBy('nama')->get(['id', 'nama', 'nip']);
        $teacherIds = $teachers->pluck('id');
        $attendanceByUser = Absensi::query()->whereDate('tanggal', $date)->whereIn('user_id', $teacherIds)->get()->keyBy('user_id');
        $approvedLeaves = PengajuanIzin::query()
            ->with('user:id,nama,nip')
            ->where('status_approval', 'APPROVED')
            ->whereDate('tanggal_mulai', '<=', $date)
            ->whereDate('tanggal_selesai', '>=', $date)
            ->whereIn('user_id', $teacherIds)
            ->orderByDesc('updated_at')
            ->get()
            ->groupBy('user_id');

        $substituteRequests = PengajuanGuruPengganti::query()
            ->with(['guruUtama:id,nama,nip', 'guruPengganti:id,nama,nip', 'jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran'])
            ->whereDate('tanggal', $date)
            ->latest('created_at')
            ->get();

        $present = $notCheckedIn = $verificationPending = $rejected = [];
        $leave = $sick = $outsideDuty = [];
        $attendanceChart = ['Hadir terverifikasi' => 0, 'Belum absen masuk' => 0, 'Menunggu verifikasi' => 0, 'Ditolak' => 0, 'Izin' => 0, 'Sakit' => 0, 'Dinas luar' => 0, 'Libur sekolah' => 0];
        foreach ($teachers as $teacher) {
            $attendance = $attendanceByUser->get($teacher->id);
            $status = $attendance?->status_verifikasi_masuk;
            $hasCheckIn = (bool) $attendance?->jam_masuk;
            $validPresence = $hasCheckIn && in_array($status, ['VERIFIED', 'APPROVED'], true);
            $activeLeaves = $approvedLeaves->get($teacher->id, collect());
            $activeLeave = $activeLeaves->first();
            $isSick = $activeLeaves->contains(fn ($item) => $item->jenis_pengajuan === 'CUTI' && stripos($item->alasan, 'sakit') !== false);
            $isOutsideDuty = $activeLeaves->contains(fn ($item) => $item->jenis_pengajuan === 'DINAS');
            $isPermission = $activeLeaves->contains(fn ($item) => $item->jenis_pengajuan === 'CUTI' && stripos($item->alasan, 'sakit') === false);
            $isSick = $isSick || ($status === 'CUTI' && stripos((string) $attendance?->catatan_admin, 'sakit') !== false);
            $isOutsideDuty = $isOutsideDuty || $status === 'DINAS_LUAR';
            $isPermission = $isPermission || ($status === 'CUTI' && ! $isSick);

            if ($validPresence) $present[] = $teacher;
            if ($isSick) $sick[] = $teacher;
            if ($isPermission) $leave[] = $teacher;
            if ($isOutsideDuty) $outsideDuty[] = $teacher;

            if ($validPresence) $attendanceChart['Hadir terverifikasi']++;
            elseif ($hasCheckIn && $status === 'REJECTED') $attendanceChart['Ditolak']++;
            elseif ($hasCheckIn) $attendanceChart['Menunggu verifikasi']++;
            elseif ($isOutsideDuty) $attendanceChart['Dinas luar']++;
            elseif ($isSick) $attendanceChart['Sakit']++;
            elseif ($isPermission) $attendanceChart['Izin']++;
            elseif ($holiday) $attendanceChart['Libur sekolah']++;
            else {
                $notCheckedIn[] = $teacher;
                $attendanceChart['Belum absen masuk']++;
            }
            if ($hasCheckIn && ! $validPresence && $status !== 'REJECTED') $verificationPending[] = $teacher;
            if ($hasCheckIn && $status === 'REJECTED') $rejected[] = $teacher;
        }

        $yearConsistency = $academicYears->consistency();
        $currentSessions = collect();
        $meta = ['tahun_ajaran' => null, 'semester' => null, 'siklus_minggu' => null, 'hari' => $cycles->getHariIndo($now)];
        if ($yearConsistency['consistent'] && ! $holiday) {
            $year = TahunAjaran::query()->where('is_active', true)->first();
            $semester = Setting::value('active_semester') ?: ($now->month >= 7 ? 'Ganjil' : 'Genap');
            $cycle = $cycles->getCurrentCycle($now, Setting::value('semester_start_date', config('aksara.academic.semester_start_date')));
            $meta = ['tahun_ajaran' => $year?->tahun_ajaran, 'semester' => $semester, 'siklus_minggu' => $cycle, 'hari' => $cycles->getHariIndo($now)];
            $overrides = AgendaSekolah::query()->whereDate('tanggal', $date)->where('scope', 'SEKOLAH')->where('override_kbm', true)->get();
            $schedules = JadwalPelajaran::query()
                ->with(['guru:id,nama,nip', 'kelas:id,nama_kelas', 'mataPelajaran:id,nama_mapel'])
                ->with(['jurnalMengajars' => fn ($query) => $query->whereDate('tanggal', $date)->withCount('presensiSiswas')])
                ->where('tahun_ajaran_id', $year->id)
                ->where('semester', $semester)
                ->where('hari', $meta['hari'])
                ->where(fn ($query) => $query->whereNull('siklus_minggu')->orWhere('siklus_minggu', $cycle))
                ->get();

            $resolvedSchedules = $schedules->map(function (JadwalPelajaran $schedule) use ($calendarResolver, $now, $overrides): ?array {
                $journal = $schedule->jurnalMengajars->first();
                try {
                    if ($journal?->waktu_rencana_mulai && $journal?->waktu_rencana_selesai) {
                        $start = Carbon::parse($journal->waktu_rencana_mulai, config('app.timezone'));
                        $end = Carbon::parse($journal->waktu_rencana_selesai, config('app.timezone'));
                    } else {
                        $resolved = $calendarResolver->resolve($schedule, $now);
                        $start = Carbon::parse($resolved['jam_mulai'], config('app.timezone'));
                        $end = Carbon::parse($resolved['jam_selesai'], config('app.timezone'));
                    }
                } catch (\RuntimeException $exception) {
                    report($exception);
                    return null;
                }

                if ($now->lt($start) || $now->gte($end)) return null;
                if ($overrides->contains(fn (AgendaSekolah $agenda) => $agenda->jam_mulai < $end->format('H:i:s') && $agenda->jam_selesai > $start->format('H:i:s'))) return null;

                return ['schedule' => $schedule, 'start' => $start, 'end' => $end];
            })->filter()->sortBy(fn (array $item) => $item['start']->timestamp)->values();

            $currentSessions = $resolvedSchedules->map(function (array $item): array {
                /** @var JadwalPelajaran $schedule */
                $schedule = $item['schedule'];
                $journal = $schedule->jurnalMengajars->first();
                $expectedStudents = DB::table('penempatan_siswas')->where('kelas_id', $schedule->kelas_id)->where('tahun_ajaran_id', $schedule->tahun_ajaran_id)->count();
                $markedStudents = (int) ($journal?->presensi_siswas_count ?? 0);
                return [
                    'schedule_id' => $schedule->id,
                    'teacher_id' => $schedule->user_id,
                    'teacher_name' => $schedule->guru?->nama ?? 'Guru tidak ditemukan',
                    'teacher_nip' => $schedule->guru?->nip,
                    'class_name' => $schedule->kelas?->nama_kelas ?? 'Kelas tidak ditemukan',
                    'subject_name' => $schedule->mataPelajaran?->nama_mapel ?? 'Mata pelajaran',
                    'start' => $item['start']->format('H:i'),
                    'end' => $item['end']->format('H:i'),
                    'journal_filled' => in_array($journal?->status_sesi, ['final', 'finalisasi_susulan'], true),
                    'journal_status' => $journal?->status_sesi ?? 'Belum diisi',
                    'expected_students' => $expectedStudents,
                    'marked_students' => $markedStudents,
                    'is_in_class' => $journal?->status_sesi === 'final' && $expectedStudents > 0 && $markedStudents >= $expectedStudents,
                ];
            });
        }
        $inClassSessions = $currentSessions->where('is_in_class', true)->values();
        $notInClassSessions = $currentSessions->where('is_in_class', false)->values();
        $inClassTeachers = $teachers->whereIn('id', $inClassSessions->pluck('teacher_id'))->values();

        return response()->json([
            'data' => [
                'date' => $date,
                'holiday' => $holiday ? ['nama' => $holiday->nama, 'jenis' => $holiday->jenis] : null,
                'time' => $now->format('H:i:s'),
                'teachers_total' => $teachers->count(),
                'present_count' => count($present),
                'present_teachers' => $present,
                'not_checked_in_count' => count($notCheckedIn),
                'not_checked_in_teachers' => $notCheckedIn,
                'verification_pending_count' => count($verificationPending),
                'verification_pending_teachers' => $verificationPending,
                'rejected_count' => count($rejected),
                'rejected_teachers' => $rejected,
                'leave_count' => count($leave),
                'leave_teachers' => $leave,
                'sick_count' => count($sick),
                'sick_teachers' => $sick,
                'outside_duty_count' => count($outsideDuty),
                'outside_duty_teachers' => $outsideDuty,
                'attendance_chart' => ['labels' => array_keys($attendanceChart), 'values' => array_values($attendanceChart)],
                'current_sessions_count' => $currentSessions->count(),
                'in_class_sessions_count' => $inClassSessions->count(),
                'not_in_class_sessions_count' => $notInClassSessions->count(),
                'in_class_teacher_count' => $inClassTeachers->count(),
                'in_class_teachers' => $inClassTeachers,
                'in_class_sessions' => $inClassSessions,
                'not_in_class_sessions' => $notInClassSessions,
                'substitute_requests' => $substituteRequests,
                'pending_substitute_requests_count' => $substituteRequests->where('status_approval', 'PENDING')->count(),
                'approved_substitute_requests_count' => $substituteRequests->where('status_approval', 'APPROVED')->count(),
                'meta' => $meta,
            ],
        ]);
    }

    /**
     * Endpoint GET /api/v1/dashboard/curriculum.
     * Menyediakan KPI dan ringkasan pembelajaran kurikulum berdasarkan tanggal atau tahun ajaran yang dipilih.
     */
    public function curriculum(Request $request, CycleScheduleService $cycles, ActiveAcademicYearService $academicYears)
    {
        $filters = $request->validate([
            'date' => ['sometimes', 'date'],
            'tahun_ajaran_id' => ['sometimes', 'integer', 'exists:tahun_ajarans,id'],
            'semester' => ['sometimes', 'in:Ganjil,Genap'],
        ]);
        $date = isset($filters['date']) ? Carbon::parse($filters['date'], config('app.timezone')) : now(config('app.timezone'));
        $sync = $academicYears->consistency();
        if (! isset($filters['tahun_ajaran_id']) && ! $sync['consistent']) {
            throw new ConflictHttpException('Tahun ajaran aktif belum konsisten; KPI ditahan sampai data diperbaiki.');
        }
        $year = isset($filters['tahun_ajaran_id'])
            ? TahunAjaran::query()->findOrFail($filters['tahun_ajaran_id'])
            : TahunAjaran::query()->where('is_active', true)->firstOrFail();
        $semester = $filters['semester'] ?? (Setting::value('active_semester') ?: ($date->month >= 7 ? 'Ganjil' : 'Genap'));
        $weekday = $cycles->getHariIndo($date);
        $cycle = $cycles->getCurrentCycle($date, Setting::value('semester_start_date', config('aksara.academic.semester_start_date')));
        $scheduleQuery = JadwalPelajaran::query()
            ->where('tahun_ajaran_id', $year->id)
            ->where('semester', $semester)
            ->where('hari', $weekday)
            ->where(fn ($query) => $query->whereNull('siklus_minggu')->orWhere('siklus_minggu', $cycle));
        $schedules = $scheduleQuery->get();
        $scheduleIds = $schedules->pluck('id');
        $teacherIds = $schedules->pluck('user_id')->unique();
        $agendaOverrides = AgendaSekolah::query()
            ->whereDate('tanggal', $date->toDateString())->where('scope', 'SEKOLAH')->where('override_kbm', true)->count();
        $attendance = Absensi::query()->whereDate('tanggal', $date->toDateString())
            ->whereIn('user_id', $teacherIds)
            ->whereIn('status_verifikasi_masuk', ['VERIFIED', 'APPROVED'])
            ->distinct('user_id')->count('user_id');
        $journals = JurnalMengajar::query()->whereDate('tanggal', $date->toDateString())
            ->whereIn('jadwal_pelajaran_id', $scheduleIds)->whereIn('status_sesi', ['final', 'finalisasi_susulan'])->count();
        $flagged = Absensi::query()->whereDate('tanggal', $date->toDateString())
            ->where(fn ($query) => $query
                ->whereIn('status_verifikasi_masuk', ['PENDING', 'FLAGGED'])
                ->orWhereIn('status_verifikasi_pulang', ['PENDING', 'FLAGGED']))->count();

        return response()->json([
            'data' => [
                'date' => $date->toDateString(),
                'tahun_ajaran' => $year->tahun_ajaran,
                'semester' => $semester,
                'hari' => $weekday,
                'siklus_minggu' => $cycle,
                'scheduled_sessions' => $schedules->count(),
                'journal_records' => $journals,
                'scheduled_teachers' => $teacherIds->count(),
                'present_scheduled_teachers' => $attendance,
                'flagged_attendances' => $flagged,
                'school_agenda_overrides' => $agendaOverrides,
                'kpi_percentages' => null,
                'available_years' => TahunAjaran::query()->orderByDesc('tahun_ajaran')->get(['id', 'tahun_ajaran', 'is_active']),
            ],
            'meta' => [
                'metric_state' => 'raw_counts_only',
                'note' => 'Persentase keterisian, ketercapaian jam, dan kehadiran menunggu definisi KPI resmi dari pemilik produk.',
            ],
        ]);
    }
}
