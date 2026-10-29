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
        $slotMinutes = max(1, (int) config('aksara.push_reminders.interval_minutes', 30));
        $checkInEndTime = config('aksara.push_reminders.check_in_end_time', '18:00:00');
        $checkOutEndTime = config('aksara.push_reminders.check_out_end_time', '18:00:00');

        $checkInStartAt = $schedule?->jam_masuk_mulai
            ? $this->atTime($now, $schedule->jam_masuk_mulai)
            : $this->atTime($now, '07:00:00');
        // Keep reminding until the end of the day if check-in is still missing.
        // The configured late boundary (for example 08:45) determines lateness,
        // but must not stop attendance reminders.
        $checkInEndsAt = $this->atTime($now, $checkInEndTime);

        // Start check-out reminders a configurable number of minutes before
        // the reminder end time, independent of the schedule's check-out opening time.
        $checkOutEndsAt = $this->atTime($now, $checkOutEndTime);
        $checkOutLeadMinutes = max(0, (int) config('aksara.push_reminders.check_out_lead_minutes', 30));
        $checkOutStartsAt = $checkOutEndsAt->subMinutes($checkOutLeadMinutes);
        // Treat the configured end time as exclusive: do not send at or after it.
        $checkOutLastMoment = $checkOutEndsAt->subSecond();

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
                $slot = intdiv(max(0, (int) $checkInStartAt->diffInMinutes($now)), $slotMinutes);
                $sent += $this->sendOnce(
                    $teacher,
                    "check-in:{$now->toDateString()}:{$teacher->id}:{$slot}",
                    'Pengingat presensi masuk',
                    'Presensi masuk Anda belum tercatat. Silakan segera melakukan presensi masuk.',
                    "check-in-{$now->toDateString()}-{$teacher->id}-{$slot}",
                    $now,
                );
            }

            if ($attendance?->jam_masuk && ! $attendance->jam_pulang
                && $checkOutStartsAt && $checkOutEndsAt
                && $this->within($now, $checkOutStartsAt, $checkOutLastMoment)) {
                $slot = intdiv(max(0, (int) $checkOutStartsAt->diffInMinutes($now)), $slotMinutes);
                $sent += $this->sendOnce(
                    $teacher,
                    "check-out:{$now->toDateString()}:{$teacher->id}:{$slot}",
                    'Pengingat presensi pulang',
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

            $journalReminderStartsAt = $start->addMinutes(15);
            $journalReminderInterval = max(1, (int) config('aksara.push_reminders.interval_minutes', 15));

            // This reminder is only for a journal that has not been created yet.
            // Once a draft exists, only the finalization reminder should be sent.
            if (! $journal && $this->within($now, $journalReminderStartsAt, $end)) {
                $slot = intdiv(
                    max(0, (int) $journalReminderStartsAt->diffInMinutes($now)),
                    $journalReminderInterval,
                );

                $sent += $this->sendOnce(
                    $teacher,
                    "journal:{$now->toDateString()}:{$schedule->id}:{$teacher->id}:{$slot}",
                    'Pengingat jurnal mengajar',
                    'Jurnal mengajar sesi ini belum diisi. Silakan isi jurnal mengajar.',
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

            $finalizationReminderStartsAt = $end->subMinutes(15);
            $finalizationReminderInterval = max(1, (int) config('aksara.push_reminders.interval_minutes', 15));

            // Start 15 minutes before the lesson ends and repeat at each configured
            // interval until the journal is finalized (status is no longer draft).
            if ($journal && $journal->status_sesi === JurnalMengajar::STATUS_DRAFT
                && $now->greaterThanOrEqualTo($finalizationReminderStartsAt)) {
                $slot = intdiv(
                    max(0, (int) $finalizationReminderStartsAt->diffInMinutes($now)),
                    $finalizationReminderInterval,
                );

                $sent += $this->sendOnce(
                    $teacher,
                    "journal-finalize:{$now->toDateString()}:{$schedule->id}:{$teacher->id}:{$slot}",
                    'Pengingat finalisasi jurnal',
                    'Jurnal mengajar sesi ini masih berstatus draft. Silakan finalkan jurnal Anda.',
                    "journal-finalize-{$now->toDateString()}-{$schedule->id}-{$teacher->id}",
                    $now,
                );
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
