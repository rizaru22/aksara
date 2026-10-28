<?php

namespace App\Services;

use App\Models\Absensi;
use App\Models\AgendaSekolah;
use App\Models\HariLibur;
use App\Models\JadwalPelajaran;
use App\Models\JadwalPresensiHarian;
use App\Models\JurnalMengajar;
use App\Models\PengajuanIzin;
use App\Models\PengajuanGuruPengganti;
use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Services\KalenderJamPelajaranResolver;
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
            ->whereIn('jenis_pengajuan', ['CUTI', 'DINAS'])
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
        $checkInStartAt = $schedule?->jam_masuk_mulai
            ? $this->atTime($now, $schedule->jam_masuk_mulai)
            : $this->atTime($now, '07:00:00');
        // Keep reminding until the end of the day if check-in is still missing.
        // The configured late boundary (for example 08:45) determines lateness,
        // but must not stop attendance reminders.
        $checkInEndsAt = $this->atTime($now, '23:59:59');

        $checkOutStartsAt = $schedule?->jam_pulang_mulai
            ? $this->atTime($now, $schedule->jam_pulang_mulai)
            : null;
        // Keep reminding about check-out until 18:00 even when the configured
        // school dismissal time is earlier.
        $checkOutEndsAt = $this->atTime($now, '18:00:00');

        foreach ($teachers as $teacher) {
            if (in_array((int) $teacher->id, $onLeave, true)) {
                continue;
            }

            $attendance = Absensi::query()
                ->where('user_id', $teacher->id)
                ->whereDate('tanggal', $now->toDateString())
                ->first();

            if (! $attendance?->jam_masuk
                && $this->within($now, $checkInStartAt, $checkInEndsAt)) {
                $slot = intdiv(max(0, (int) $checkInStartAt->diffInMinutes($now)), 30);
                $sent += $this->sendOnce(
                    $teacher,
                    "check-in:{$now->toDateString()}:{$teacher->id}:{$slot}",
                    'Pengingat absen masuk',
                    'Presensi masuk Anda belum tercatat. Silakan segera melakukan presensi masuk.',
                    "check-in-{$now->toDateString()}-{$teacher->id}-{$slot}",
                    $now,
                );
            }

            if ($attendance?->jam_masuk && ! $attendance->jam_pulang
                && $checkOutStartsAt && $checkOutEndsAt
                && $this->within($now, $checkOutStartsAt, $checkOutEndsAt)) {
                $slot = intdiv(max(0, (int) $checkOutStartsAt->diffInMinutes($now)), 30);
                $sent += $this->sendOnce(
                    $teacher,
                    "check-out:{$now->toDateString()}:{$teacher->id}:{$slot}",
                    'Pengingat absen pulang',
                    'Presensi pulang Anda belum tercatat. Silakan melakukan presensi pulang saat periode presensi berlaku.',
                    "check-out-{$now->toDateString()}-{$teacher->id}-{$slot}",
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

        $approvedSubstitutions = PengajuanGuruPengganti::query()
            ->where('status_approval', 'APPROVED')
            ->whereDate('tanggal', $now->toDateString())
            ->whereIn('guru_pengganti_id', $teachers->modelKeys())
            ->get()
            ->keyBy('jadwal_pelajaran_id');

        $schedules = JadwalPelajaran::query()
            ->with(['jurnalMengajars' => fn ($query) => $query
                ->with('presensiSiswas')
                ->whereDate('tanggal', $now->toDateString())])
            ->where(function ($query) use ($teachers, $approvedSubstitutions) {
                $query->whereIn('user_id', $teachers->modelKeys());
                if ($approvedSubstitutions->isNotEmpty()) {
                    $query->orWhereIn('id', $approvedSubstitutions->keys());
                }
            })
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
            $substitution = $approvedSubstitutions->get($schedule->id);
            $teacher = $substitution
                ? $teachersById->get($substitution->guru_pengganti_id)
                : $teachersById->get($schedule->user_id);
            if (! $teacher || in_array((int) $teacher->id, $onLeave, true)) {
                continue;
            }

            $journal = $schedule->jurnalMengajars->first();

            // Existing journal snapshots must survive calendar activation changes.
            // Future sessions without snapshots resolve against the currently active calendar.
            try {
                if ($journal?->waktu_rencana_mulai && $journal?->waktu_rencana_selesai) {
                    $start = CarbonImmutable::parse($journal->waktu_rencana_mulai, config('app.timezone'));
                    $end = CarbonImmutable::parse($journal->waktu_rencana_selesai, config('app.timezone'));
                } else {
                    $resolved = app(KalenderJamPelajaranResolver::class)->resolve($schedule, $now);
                    $start = CarbonImmutable::parse($resolved['jam_mulai'], config('app.timezone'));
                    $end = CarbonImmutable::parse($resolved['jam_selesai'], config('app.timezone'));
                }
            } catch (\RuntimeException $exception) {
                Log::warning('Lesson reminder skipped because schedule time could not be resolved.', [
                    'schedule_id' => $schedule->id,
                    'date' => $now->toDateString(),
                    'exception' => $exception->getMessage(),
                ]);
                continue;
            }

            $cancelledSession = $cancelled->contains(fn (AgendaSekolah $agenda) =>
                $agenda->jam_mulai < $end->format('H:i:s') && $agenda->jam_selesai > $start->format('H:i:s')
            );
            if ($cancelledSession) {
                continue;
            }

            if (! $journal && $this->within($now, $start->addMinutes(15), $end)) {
                $sent += $this->sendOnce(
                    $teacher,
                    "journal:{$now->toDateString()}:{$schedule->id}:{$teacher->id}",
                    'Pengingat jurnal dan presensi siswa',
                    'Pelajaran sudah berjalan 15 menit. Silakan isi jurnal mengajar dan presensi siswa.',
                    "journal-{$now->toDateString()}-{$schedule->id}-{$teacher->id}",
                    $now,
                );
            }

            if ($journal && $journal->presensiSiswas->isEmpty()
                && $this->within($now, $start->addMinutes(15), $end)) {
                $sent += $this->sendOnce(
                    $teacher,
                    "student-attendance:{$now->toDateString()}:{$schedule->id}:{$teacher->id}",
                    'Pengingat presensi siswa',
                    'Pelajaran sudah berjalan 15 menit. Presensi siswa pada sesi ini belum diisi.',
                    "student-attendance-{$now->toDateString()}-{$schedule->id}-{$teacher->id}",
                    $now,
                );
            }

            if ($journal && $journal->status_sesi === JurnalMengajar::STATUS_DRAFT) {
                // Cron runs every 15 minutes: keep a window around the planned end so
                // the main reminder is not missed due to scheduler timing.
                if ($this->within($now, $end->subMinutes(15), $end->subSecond())) {
                    $sent += $this->sendOnce(
                        $teacher,
                        "journal-finalize:{$now->toDateString()}:{$schedule->id}:{$teacher->id}:main",
                        'Pengingat finalisasi jurnal',
                        'Pelajaran akan berakhir dalam sekitar 15 menit. Silakan finalkan jurnal mengajar Anda.',
                        "journal-finalize-{$now->toDateString()}-{$schedule->id}-{$teacher->id}-main",
                        $now,
                    );
                }

                if ($this->within($now, $end, $end->addMinutes(15))) {
                    $sent += $this->sendOnce(
                        $teacher,
                        "journal-finalize:{$now->toDateString()}:{$schedule->id}:{$teacher->id}:follow-up",
                        'Tindak lanjut finalisasi jurnal',
                        'Jurnal sesi pelajaran ini masih berstatus draft. Silakan selesaikan finalisasi jurnal.',
                        "journal-finalize-{$now->toDateString()}-{$schedule->id}-{$teacher->id}-follow-up",
                        $now,
                    );
                }
            }
        }
    }

    private function sendOnce(User $teacher, string $key, string $title, string $body, string $tag, CarbonImmutable $now): int
    {
        // Reserve the unique reminder key before sending so overlapping scheduler
        // runs cannot both pass an exists() check and dispatch the same reminder.
        $reserved = DB::table('push_reminder_dispatches')->insertOrIgnore([
            'reminder_key' => $key,
            'sent_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        if ($reserved !== 1) {
            return 0;
        }

        try {
            $teacher->notify(new TeacherReminderNotification($title, $body, $tag));

            return 1;
        } catch (Throwable $exception) {
            // Keep the reservation (at-most-once delivery) because the provider may
            // have accepted a push before an exception occurred; deleting it could
            // cause a duplicate on the next scheduler tick.
            Log::warning('Web push reminder dispatch failed after reservation.', [
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
