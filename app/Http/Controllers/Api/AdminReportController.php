<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Absensi;
use App\Models\AgendaSekolah;
use App\Models\HariLibur;
use App\Models\JadwalPelajaran;
use App\Models\JurnalMengajar;
use App\Models\JadwalPresensiHarian;
use App\Models\PengajuanIzin;
use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Services\CycleScheduleService;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;

class AdminReportController extends Controller
{
    public function index(Request $request, CycleScheduleService $cycles)
    {
        abort_unless($request->user()->hasRole('admin') || $request->user()->can('view-dashboard-kurikulum'), 403);

        $filters = $request->validate([
            'period' => ['required', 'in:daily,weekly,monthly'],
            'date' => ['required_if:period,daily,weekly', 'nullable', 'date'],
            'month' => ['required_if:period,monthly', 'nullable', 'date_format:Y-m'],
        ]);

        return match ($filters['period']) {
            'daily' => response()->json(['data' => $this->daily($filters['date'], $cycles)]),
            'weekly' => response()->json(['data' => $this->weekly($filters['date'], $cycles)]),
            'monthly' => response()->json(['data' => $this->monthly($filters['month'])]),
        };
    }

    private function daily(string $date, CycleScheduleService $cycles): array
    {
        $day = Carbon::parse($date, config('app.timezone'))->startOfDay();
        $teachers = $this->userRoster();
        $attendance = Absensi::query()->whereDate('tanggal', $date)->whereIn('user_id', $teachers->modelKeys())->get()->keyBy('user_id');
        $leaves = $this->approvedLeaves($teachers->modelKeys(), $date, $date)->groupBy('user_id');
        $holiday = HariLibur::query()->whereDate('tanggal', $date)->first();
        $isHoliday = (bool) $holiday || $day->isSunday();

        $teacherRows = $teachers->map(function (User $teacher) use ($attendance, $leaves, $date, $isHoliday): array {
            $record = $attendance->get($teacher->id);
            $status = $this->attendanceStatus($record, $leaves->get($teacher->id, collect())->first(), $isHoliday);
            return [
                'teacher_name' => $teacher->nama,
                'nip' => $teacher->nip,
                'status' => $status,
                'jam_masuk' => $record?->jam_masuk,
                'jam_pulang' => $record?->jam_pulang,
                'status_verifikasi' => $record?->status_verifikasi_masuk,
            ];
        });

        return [
            'period' => ['from' => $date, 'to' => $date, 'label' => $day->translatedFormat('l, d F Y')],
            'holiday' => $holiday ? ['nama' => $holiday->nama, 'jenis' => $holiday->jenis] : ($day->isSunday() ? ['nama' => 'Hari Minggu', 'jenis' => 'MINGGU'] : null),
            'attendance' => $teacherRows,
            'classes' => $this->classSessions(collect([$day]), $cycles),
        ];
    }

    private function weekly(string $date, CycleScheduleService $cycles): array
    {
        $start = Carbon::parse($date, config('app.timezone'))->startOfWeek(Carbon::MONDAY)->startOfDay();
        $end = $start->copy()->addDays(6)->endOfDay();
        $teachers = $this->userRoster();
        $teacherIds = $teachers->modelKeys();
        $attendance = Absensi::query()->whereBetween('tanggal', [$start->toDateString(), $end->toDateString()])
            ->whereIn('user_id', $teacherIds)->get()->groupBy('user_id');
        $leaves = $this->approvedLeaves($teacherIds, $start->toDateString(), $end->toDateString())->groupBy('user_id');
        $holidays = HariLibur::query()->whereBetween('tanggal', [$start->toDateString(), $end->toDateString()])->get()->keyBy(fn (HariLibur $item) => $item->tanggal->toDateString());
        $dailySchedules = JadwalPresensiHarian::query()->get()->keyBy('hari');

        $attendanceRows = $teachers->map(function (User $teacher) use ($attendance, $leaves, $holidays, $dailySchedules, $start): array {
            $records = $attendance->get($teacher->id, collect())->keyBy(fn (Absensi $item) => substr((string) $item->tanggal, 0, 10));
            $presentDays = 0;
            $minutes = 0;
            foreach (CarbonPeriod::create($start->toDateString(), $start->copy()->addDays(6)->toDateString()) as $day) {
                $key = $day->toDateString();
                $record = $records->get($key);
                $leave = $leaves->get($teacher->id, collect())->first(fn (PengajuanIzin $item) => $item->tanggal_mulai <= $key && $item->tanggal_selesai >= $key);
                $status = $this->attendanceStatus($record, $leave, (bool) $holidays->get($key) || $day->isSunday());
                if (in_array($status, ['HADIR', 'MENUNGGU VERIFIKASI', 'DITOLAK', 'DINAS LUAR'], true)) $presentDays++;
                if ($record?->jam_masuk && $record?->jam_pulang) {
                    $minutes += $this->durationMinutes($record->jam_masuk, $record->jam_pulang);
                } elseif ($status === 'DINAS LUAR') {
                    // Approved outside duty has no check-in/out timestamps, so credit
                    // the school's configured attendance window for that weekday.
                    $dayName = [1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu', 4 => 'Kamis', 5 => 'Jumat', 6 => 'Sabtu'][$day->dayOfWeekIso] ?? null;
                    $schedule = $dayName ? $dailySchedules->get($dayName) : null;
                    if ($schedule?->jam_masuk_mulai && $schedule?->jam_pulang_akhir) {
                        $minutes += $this->durationMinutes($schedule->jam_masuk_mulai, $schedule->jam_pulang_akhir);
                    }
                }
            }
            return [
                'teacher_name' => $teacher->nama,
                'nip' => $teacher->nip,
                'days_with_attendance' => $presentDays,
                'total_minutes' => $minutes,
                'total_duration' => sprintf('%d jam %02d menit', intdiv($minutes, 60), $minutes % 60),
            ];
        });

        $classRows = $this->classSessions(collect(CarbonPeriod::create($start->toDateString(), $start->copy()->addDays(6)->toDateString())), $cycles);
        $missingByTeacher = $classRows->where('journal_filled', false)->groupBy('teacher_name')->map(fn ($rows, $name) => [
            'teacher_name' => $name,
            'missing_sessions' => $rows->count(),
            'sessions' => $rows->map(fn ($row) => ['date' => $row['date'], 'class_name' => $row['class_name'], 'subject_name' => $row['subject_name'], 'start' => $row['start']])->values(),
        ])->values();

        return [
            'period' => ['from' => $start->toDateString(), 'to' => $start->copy()->addDays(6)->toDateString(), 'label' => $start->translatedFormat('d F').' – '.$start->copy()->addDays(6)->translatedFormat('d F Y')],
            'attendance' => $attendanceRows,
            'attendance_hours_note' => 'Dinas luar yang disetujui dihitung sebagai hari hadir. Jika tidak ada jam presensi aktual, jam kerja dikreditkan sesuai rentang jadwal presensi sekolah pada hari tersebut.',
            'classes' => $classRows,
            'class_summary' => [
                'total' => $classRows->count(),
                'filled' => $classRows->where('journal_filled', true)->count(),
                'draft' => $classRows->where('journal_status', 'berlangsung')->count(),
                'missing' => $classRows->where('journal_status', 'Belum diisi')->count(),
            ],
            'teachers_missing_journal' => $missingByTeacher,
        ];
    }

    private function monthly(string $month): array
    {
        [$year, $monthNumber] = array_map('intval', explode('-', $month));
        $start = Carbon::create($year, $monthNumber, 1, 0, 0, 0, config('app.timezone'));
        $end = $start->copy()->endOfMonth();
        $holidays = HariLibur::query()->whereBetween('tanggal', [$start->toDateString(), $end->toDateString()])->pluck('tanggal')->map(fn ($date) => substr((string) $date, 0, 10))->flip();
        $workDates = collect(CarbonPeriod::create($start->toDateString(), $end->toDateString()))
            ->filter(fn (Carbon $day) => ! $day->isSunday() && ! $holidays->has($day->toDateString()))->values();
        $teachers = $this->userRoster();
        $teacherIds = $teachers->modelKeys();
        $records = Absensi::query()->whereBetween('tanggal', [$start->toDateString(), $end->toDateString()])->whereIn('user_id', $teacherIds)->get()->groupBy('user_id');
        $leaves = $this->approvedLeaves($teacherIds, $start->toDateString(), $end->toDateString())->groupBy('user_id');

        $counts = ['present' => 0, 'permission' => 0, 'sick' => 0, 'outside_duty' => 0, 'absent' => 0, 'pending' => 0, 'rejected' => 0];
        $userCounts = [];
        foreach ($teachers as $teacher) {
            $userCounts[$teacher->id] = ['present' => 0, 'permission' => 0, 'sick' => 0, 'outside_duty' => 0, 'absent' => 0, 'pending' => 0, 'rejected' => 0];
            $teacherRecords = $records->get($teacher->id, collect())->keyBy(fn (Absensi $item) => substr((string) $item->tanggal, 0, 10));
            foreach ($workDates as $day) {
                $key = $day->toDateString();
                $record = $teacherRecords->get($key);
                $leave = $leaves->get($teacher->id, collect())->first(fn (PengajuanIzin $item) => $item->tanggal_mulai <= $key && $item->tanggal_selesai >= $key);
                $status = $this->attendanceStatus($record, $leave, false);
                $countKey = match ($status) {
                    'HADIR' => 'present',
                    'IZIN' => 'permission',
                    'SAKIT' => 'sick',
                    'DINAS LUAR' => 'outside_duty',
                    'MENUNGGU VERIFIKASI' => 'pending',
                    'DITOLAK' => 'rejected',
                    default => 'absent',
                };
                $counts[$countKey]++;
                $userCounts[$teacher->id][$countKey]++;
            }
        }

        $expectedDays = $teachers->count() * $workDates->count();
        $presentCount = $counts['present'] + $counts['outside_duty'];
        $percent = fn (int $count): float => $expectedDays > 0 ? round(($count / $expectedDays) * 100, 2) : 0.0;
        $userRows = $teachers->map(function (User $teacher) use ($userCounts, $workDates): array {
            $counts = $userCounts[$teacher->id];
            $days = $workDates->count();
            $perUserPercent = fn (int $count): float => $days > 0 ? round(($count / $days) * 100, 2) : 0.0;
            return [
                'nama' => $teacher->nama, 'nip' => $teacher->nip,
                'present_count' => $counts['present'] + $counts['outside_duty'], 'present_percentage' => $perUserPercent($counts['present'] + $counts['outside_duty']),
                'permission_count' => $counts['permission'], 'sick_count' => $counts['sick'],
                'outside_duty_count' => $counts['outside_duty'], 'absent_count' => $counts['absent'],
                'pending_count' => $counts['pending'], 'rejected_count' => $counts['rejected'],
            ];
        })->values();
        return [
            'period' => ['from' => $start->toDateString(), 'to' => $end->toDateString(), 'label' => $start->translatedFormat('F Y')],
            'summary' => [
                'teacher_count' => $teachers->count(), 'workdays' => $workDates->count(), 'expected_teacher_days' => $expectedDays,
                'present_count' => $presentCount, 'present_percentage' => $percent($presentCount),
                'permission_count' => $counts['permission'], 'sick_count' => $counts['sick'],
                'permission_sick_count' => $counts['permission'] + $counts['sick'],
                'permission_sick_percentage' => $percent($counts['permission'] + $counts['sick']),
                'outside_duty_count' => $counts['outside_duty'], 'outside_duty_percentage' => $percent($counts['outside_duty']),
                'absent_count' => $counts['absent'], 'pending_count' => $counts['pending'], 'rejected_count' => $counts['rejected'],
            ],
            'users' => $userRows,
            'meta' => ['denominator' => 'Jumlah guru × hari kerja (Senin–Sabtu, tidak termasuk hari libur sekolah). Hadir mencakup presensi VERIFIED/APPROVED dan dinas luar yang disetujui.'],
        ];
    }

    private function classSessions($dates, CycleScheduleService $cycles)
    {
        $year = TahunAjaran::query()->where('is_active', true)->first();
        if (! $year) return collect();
        $semester = Setting::value('active_semester') ?: (now(config('app.timezone'))->month >= 7 ? 'Ganjil' : 'Genap');
        $allSchedules = JadwalPelajaran::query()->with(['guru:id,nama,nip', 'kelas:id,nama_kelas', 'mataPelajaran:id,nama_mapel'])
            ->where('tahun_ajaran_id', $year->id)->where('semester', $semester)->get()->groupBy('hari');
        $rows = collect();
        foreach ($dates as $day) {
            if ($day->isSunday() || HariLibur::query()->whereDate('tanggal', $day->toDateString())->exists()) continue;
            $weekday = $cycles->getHariIndo($day);
            $cycle = $cycles->getCurrentCycle($day, Setting::value('semester_start_date', config('aksara.academic.semester_start_date')));
            $schedules = $allSchedules->get($weekday, collect())->filter(fn (JadwalPelajaran $item) => $item->siklus_minggu === null || (int) $item->siklus_minggu === (int) $cycle)->values();
            if ($schedules->isEmpty()) continue;
            $overrides = AgendaSekolah::query()->whereDate('tanggal', $day->toDateString())->where('scope', 'SEKOLAH')->where('override_kbm', true)->get();
            $schedules = $schedules->reject(fn (JadwalPelajaran $schedule) => $overrides->contains(fn (AgendaSekolah $agenda) => $agenda->jam_mulai < $schedule->jam_selesai && $agenda->jam_selesai > $schedule->jam_mulai))->values();
            $journals = JurnalMengajar::query()->whereDate('tanggal', $day->toDateString())->whereIn('jadwal_pelajaran_id', $schedules->pluck('id'))->get()->keyBy('jadwal_pelajaran_id');
            foreach ($schedules as $schedule) {
                $journal = $journals->get($schedule->id);
                $rows->push([
                    'date' => $day->toDateString(), 'teacher_name' => $schedule->guru?->nama ?? 'Guru tidak ditemukan',
                    'nip' => $schedule->guru?->nip, 'class_name' => $schedule->kelas?->nama_kelas ?? 'Kelas tidak ditemukan',
                    'subject_name' => $schedule->mataPelajaran?->nama_mapel ?? 'Mata pelajaran',
                    'start' => substr((string) $schedule->jam_mulai, 0, 5), 'end' => substr((string) $schedule->jam_selesai, 0, 5),
                    'journal_filled' => $journal?->status_sesi === 'selesai',
                    'journal_status' => $journal?->status_sesi ?? 'Belum diisi',
                    'materi' => $journal?->materi_pembahasan, 'catatan' => $journal?->catatan_kejadian_kelas,
                    'has_photo' => (bool) $journal?->foto_kegiatan,
                ]);
            }
        }
        return $rows->sortBy([['date', 'asc'], ['start', 'asc']])->values();
    }

    private function approvedLeaves(array $teacherIds, string $from, string $to)
    {
        return PengajuanIzin::query()->whereIn('user_id', $teacherIds)->where('status_approval', 'APPROVED')
            ->whereDate('tanggal_mulai', '<=', $to)->whereDate('tanggal_selesai', '>=', $from)->orderByDesc('updated_at')->get();
    }

    private function userRoster()
    {
        return User::query()
            ->orderBy('nama')
            ->get(['id', 'nama', 'nip']);
    }

    private function attendanceStatus(?Absensi $record, ?PengajuanIzin $leave, bool $holiday): string
    {
        if ($record?->jam_masuk) {
            return match ($record->status_verifikasi_masuk) {
                'VERIFIED', 'APPROVED' => 'HADIR', 'REJECTED' => 'DITOLAK', default => 'MENUNGGU VERIFIKASI',
            };
        }
        if ($record?->status_verifikasi_masuk === 'DINAS_LUAR' || $leave?->jenis_pengajuan === 'DINAS') return 'DINAS LUAR';
        if ($record?->status_verifikasi_masuk === 'CUTI' || $leave?->jenis_pengajuan === 'CUTI') {
            $reason = $leave?->alasan ?? $record?->catatan_admin ?? '';
            return stripos($reason, 'sakit') !== false ? 'SAKIT' : 'IZIN';
        }
        return $holiday ? 'LIBUR' : 'ALPHA';
    }

    private function durationMinutes(string $from, string $to): int
    {
        [$fromHour, $fromMinute] = array_map('intval', explode(':', substr($from, 0, 5)));
        [$toHour, $toMinute] = array_map('intval', explode(':', substr($to, 0, 5)));
        $start = $fromHour * 60 + $fromMinute;
        $end = $toHour * 60 + $toMinute;
        if ($end < $start) $end += 1440;
        return $end - $start;
    }
}
