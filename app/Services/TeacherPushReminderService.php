<?php

namespace App\Services;

use App\Models\Absensi;
use App\Models\AgendaSekolah;
use App\Models\HariLibur;
use App\Models\JadwalPelajaran;
use App\Models\JadwalPresensiHarian;
use App\Models\JurnalMengajar;
use App\Models\PengajuanIzin;
use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Notifications\TeacherReminderNotification;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class TeacherPushReminderService
{
    public function sendDueReminders(): array
    {
        if (! config('webpush.vapid.public_key') || ! config('webpush.vapid.private_key')) {
            return ['sent' => 0, 'skipped' => 'VAPID keys are not configured.'];
        }

        $now = CarbonImmutable::now(config('app.timezone'));
        if ($now->isSunday() || HariLibur::query()->whereDate('tanggal', $now->toDateString())->exists()) {
            return ['sent' => 0, 'skipped' => 'School holiday.'];
        }

        $recipients = User::query()
            ->role(['guru', 'tendik', 'admin', 'kepsek', 'kurikulum'])
            ->whereHas('pushSubscriptions')
            ->with('pushSubscriptions')
            ->get();

        if ($recipients->isEmpty()) {
            return ['sent' => 0, 'skipped' => 'No subscribed recipients.'];
        }

        $onLeave = PengajuanIzin::query()
            ->whereIn('user_id', $recipients->modelKeys())
            ->where('jenis_pengajuan', 'CUTI')
            ->where('status_approval', 'APPROVED')
            ->whereDate('tanggal_mulai', '<=', $now->toDateString())
            ->whereDate('tanggal_selesai', '>=', $now->toDateString())
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $sent = 0;
        $weekday = app(CycleScheduleService::class)->getHariIndo($now);
        $attendanceSchedule = JadwalPresensiHarian::query()->where('hari', $weekday)->first();
        $this->sendAttendanceReminders($recipients, $onLeave, $attendanceSchedule, $now, $sent);

        $teachingStaff = $recipients
            ->filter(fn (User $user) => $user->can('isi-ejurnal'))
            ->values();
        $this->sendLessonReminders($teachingStaff, $onLeave, $weekday, $now, $sent);

        return ['sent' => $sent];
    }

    private function sendAttendanceReminders($teachers, array $onLeave, ?JadwalPresensiHarian $schedule, CarbonImmutable $now, int &$sent): void
    {
        $checkInDeadline = $schedule?->jam_masuk_akhir
            ?? Setting::value('jam_masuk_batas', '07:15:00');
        $checkInEndsAt = $this->atTime($now, $checkInDeadline);
        $checkInReminderAt = $checkInEndsAt->subMinutes(10);

        $checkOutDeadline = $schedule?->jam_pulang_akhir;
        $checkOutEndsAt = $checkOutDeadline ? $this->atTime($now, $checkOutDeadline) : null;

        foreach ($teachers as $teacher) {
            $teacherIsOnLeave = in_array((int) $teacher->id, $onLeave, true);

            $attendance = Absensi::query()
                ->where('user_id', $teacher->id)
                ->whereDate('tanggal', $now->toDateString())
                ->first();

            if (! $teacherIsOnLeave && ! $attendance?->jam_masuk && $this->within($now, $checkInReminderAt, $checkInEndsAt)) {
                $sent += $this->sendOnce(
                    $teacher,
                    "check-in:{$now->toDateString()}:{$teacher->id}",
                    'Pengingat absen masuk',
                    'Waktu absen masuk tinggal 10 menit lagi. Silakan catat kehadiran.',
                    "check-in-{$now->toDateString()}-{$teacher->id}",
                    $now,
                );
            }

            if ($attendance?->jam_masuk && ! $attendance->jam_pulang && $checkOutEndsAt
                && $this->within($now, $checkOutEndsAt, $checkOutEndsAt->addMinutes(5))) {
                $sent += $this->sendOnce(
                    $teacher,
                    "check-out:{$now->toDateString()}:{$teacher->id}",
                    'Pengingat absen pulang',
                    'Waktu absen pulang berakhir sekarang. Silakan catat kepulangan.',
                    "check-out-{$now->toDateString()}-{$teacher->id}",
                    $now,
                );
            }
        }
    }

    private function sendLessonReminders($teachers, array $onLeave, string $weekday, CarbonImmutable $now, int &$sent): void
    {
        $year = TahunAjaran::query()->where('is_active', true)->first();
        if (! $year) {
            return;
        }

        $semester = Setting::value('active_semester') ?: ($now->month >= 7 ? 'Ganjil' : 'Genap');
        $cycle = app(CycleScheduleService::class)->getCurrentCycle(
            $now,
            Setting::value('semester_start_date', config('aksara.academic.semester_start_date')),
        );

        $schedules = JadwalPelajaran::query()
            ->with(['jurnalMengajars' => fn ($query) => $query
                ->with('presensiSiswas')
                ->whereDate('tanggal', $now->toDateString())])
            ->whereIn('user_id', $teachers->modelKeys())
            ->where('tahun_ajaran_id', $year->id)
            ->where('semester', $semester)
            ->where('hari', $weekday)
            ->where(fn ($query) => $query->whereNull('siklus_minggu')->orWhere('siklus_minggu', $cycle))
            ->get();

        $cancelled = AgendaSekolah::query()
            ->whereDate('tanggal', $now->toDateString())
            ->where('scope', 'SEKOLAH')
            ->where('override_kbm', true)
            ->get();

        $teachersById = $teachers->keyBy('id');
        foreach ($schedules as $schedule) {
            $teacher = $teachersById->get($schedule->user_id);
            if (! $teacher || in_array((int) $teacher->id, $onLeave, true)) {
                continue;
            }

            $cancelledSession = $cancelled->contains(fn (AgendaSekolah $agenda) =>
                $agenda->jam_mulai < $schedule->jam_selesai && $agenda->jam_selesai > $schedule->jam_mulai
            );
            if ($cancelledSession) {
                continue;
            }

            $start = $this->atTime($now, $schedule->jam_mulai);
            $end = $this->atTime($now, $schedule->jam_selesai);
            $journal = $schedule->jurnalMengajars->first();

            if (! $journal && $this->within($now, $start->addMinutes(15), $end)) {
                $sent += $this->sendOnce(
                    $teacher,
                    "journal:{$now->toDateString()}:{$schedule->id}",
                    'Pengingat jurnal dan presensi siswa',
                    'Pelajaran sudah berjalan 15 menit. Silakan isi jurnal mengajar dan presensi siswa.',
                    "journal-{$now->toDateString()}-{$schedule->id}",
                    $now,
                );
            }

            if ($journal && $journal->presensiSiswas->isEmpty()
                && $this->within($now, $start->addMinutes(15), $end)) {
                $sent += $this->sendOnce(
                    $teacher,
                    "student-attendance:{$now->toDateString()}:{$schedule->id}",
                    'Pengingat presensi siswa',
                    'Pelajaran sudah berjalan 15 menit. Presensi siswa pada sesi ini belum diisi.',
                    "student-attendance-{$now->toDateString()}-{$schedule->id}",
                    $now,
                );
            }

            if (! $journal || ! $journal->foto_kegiatan) {
                $body = $journal
                    ? 'Waktu pelajaran segera berakhir. Silakan unggah foto kegiatan pelajaran.'
                    : 'Waktu pelajaran segera berakhir. Jurnal dan foto kegiatan belum dilengkapi.';

                if ($this->within($now, $end->subMinutes(5), $end->addMinutes(5))) {
                    $sent += $this->sendOnce(
                        $teacher,
                        "lesson-photo:{$now->toDateString()}:{$schedule->id}",
                        'Pengingat foto kegiatan',
                        $body,
                        "lesson-photo-{$now->toDateString()}-{$schedule->id}",
                        $now,
                    );
                }
            }
        }
    }

    private function sendOnce(User $teacher, string $key, string $title, string $body, string $tag, CarbonImmutable $now): int
    {
        if (DB::table('push_reminder_dispatches')->where('reminder_key', $key)->exists()) {
            return 0;
        }

        try {
            $teacher->notify(new TeacherReminderNotification($title, $body, $tag));
            DB::table('push_reminder_dispatches')->insertOrIgnore([
                'reminder_key' => $key,
                'sent_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            return 1;
        } catch (Throwable $exception) {
            Log::warning('Web push reminder failed.', [
                'reminder_key' => $key,
                'user_id' => $teacher->id,
                'exception' => $exception->getMessage(),
            ]);

            return 0;
        }
    }

    private function atTime(CarbonImmutable $date, string $time): CarbonImmutable
    {
        return CarbonImmutable::parse($date->toDateString().' '.$time, config('app.timezone'));
    }

    private function within(CarbonImmutable $now, CarbonImmutable $from, CarbonImmutable $until): bool
    {
        return $now->greaterThanOrEqualTo($from) && $now->lessThanOrEqualTo($until);
    }
}
