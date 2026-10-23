<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaSekolah;
use App\Models\HariLibur;
use App\Models\JadwalPelajaran;
use App\Models\PengajuanGuruPengganti;
use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Services\ActiveAcademicYearService;
use App\Services\CycleScheduleService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class TeacherScheduleController extends Controller
{
    /**
     * Endpoint GET /api/v1/teacher/schedules/today.
     * Mengambil jadwal hari ini milik guru yang sedang login, termasuk status KBM, hari libur, siklus aktif, dan ketersediaan jurnal.
     * Data ini dipakai oleh dashboard untuk menampilkan tombol isi jurnal atau finalisasi dengan pesan yang tepat.
     */
    public function today(Request $request, CycleScheduleService $cycles, ActiveAcademicYearService $academicYears)
    {
        $now = now(config('app.timezone'));
        $sync = $academicYears->consistency();
        if (! $sync['consistent']) {
            throw new ConflictHttpException('Tahun ajaran aktif belum konsisten. Hubungi Admin untuk memperbaiki sinkronisasi.');
        }

        $year = TahunAjaran::query()->where('is_active', true)->firstOrFail();
        $semester = Setting::value('active_semester') ?: ($now->month >= 7 ? 'Ganjil' : 'Genap');
        $cycle = $cycles->getCurrentCycle($now, Setting::value('semester_start_date', config('aksara.academic.semester_start_date')));
        $weekday = $cycles->getHariIndo($now);
        $isSunday = $now->isSunday();
        $holiday = HariLibur::query()->whereDate('tanggal', $now->toDateString())->first();
        if (! $holiday && $isSunday) {
            $holiday = (object) ['nama' => 'Hari Minggu', 'jenis' => 'MINGGU'];
        }

        $userId = $request->user()->id;
        $substituteScheduleIds = PengajuanGuruPengganti::query()
            ->where('guru_pengganti_id', $userId)
            ->where('status_approval', 'APPROVED')
            ->whereDate('tanggal', $now->toDateString())
            ->pluck('jadwal_pelajaran_id');

        $schedules = ($holiday || $isSunday) ? collect() : JadwalPelajaran::query()
            ->with(['kelas:id,nama_kelas,tingkat,jurusan', 'mataPelajaran:id,kode_mapel,nama_mapel', 'tahunAjaran:id,tahun_ajaran', 'guru:id,nama,nip'])
            ->with(['jurnalMengajars' => fn ($query) => $query->whereDate('tanggal', $now->toDateString())->with('presensiSiswas')])
            ->where(function ($query) use ($userId, $substituteScheduleIds) {
                $query->where('user_id', $userId);
                if ($substituteScheduleIds->isNotEmpty()) {
                    $query->orWhereIn('id', $substituteScheduleIds);
                }
            })
            ->where('tahun_ajaran_id', $year->id)
            ->where('semester', $semester)
            ->where('hari', $weekday)
            ->where(fn ($query) => $query->whereNull('siklus_minggu')->orWhere('siklus_minggu', $cycle))
            ->orderBy('jam_mulai')
            ->get();

        $agendas = AgendaSekolah::query()
            ->whereDate('tanggal', $now->toDateString())
            ->where('scope', 'SEKOLAH')
            ->where('override_kbm', true)
            ->get();

        $data = $schedules->map(function (JadwalPelajaran $schedule) use ($agendas, $now) {
            $substituteRequest = PengajuanGuruPengganti::query()
                ->where('jadwal_pelajaran_id', $schedule->id)
                ->whereDate('tanggal', $now->toDateString())
                ->with('guruPengganti:id,nama,nip')
                ->latest('id')
                ->first();

            $isApproved = $substituteRequest?->status_approval === 'APPROVED';
            $schedule->setAttribute('substitute_active', $isApproved);
            $schedule->setAttribute('substitute_status', $substituteRequest?->status_approval);
            $schedule->setAttribute('substitute_teacher', $substituteRequest?->guruPengganti ? [
                'id' => $substituteRequest->guruPengganti->id,
                'nama' => $substituteRequest->guruPengganti->nama,
                'nip' => $substituteRequest->guruPengganti->nip,
            ] : null);
            $schedule->setAttribute('substitute_request_id', $substituteRequest?->id);
            $schedule->setAttribute('jurnal_hari_ini', $schedule->jurnalMengajars->first());
            $agenda = $agendas->first(fn (AgendaSekolah $item) => $item->jam_mulai < $schedule->jam_selesai && $item->jam_selesai > $schedule->jam_mulai);
            $schedule->setAttribute('kbm_ditangguhkan', (bool) $agenda);
            $schedule->setAttribute('agenda_pengganti', $agenda?->nama_agenda);
            $journalStartsAt = Carbon::parse($now->toDateString().' '.$schedule->jam_mulai, config('app.timezone'));
            $scheduleEndsAt = Carbon::parse($now->toDateString().' '.$schedule->jam_selesai, config('app.timezone'));
            $finalizationStartsAt = $scheduleEndsAt->copy()->subMinutes(30);
            if ($finalizationStartsAt->lt($journalStartsAt)) $finalizationStartsAt = $journalStartsAt;
            $journalStatus = $schedule->jurnal_hari_ini?->status_sesi;
            $hasOpenDraft = $journalStatus === 'draft';
            $hasJournal = $journalStatus !== null;
            $insideSession = ! $now->lt($journalStartsAt) && ! $now->gt($scheduleEndsAt);
            $insideFinalizationWindow = ! $now->lt($finalizationStartsAt) && ! $now->gt($scheduleEndsAt);
            $canFillJournal = $hasOpenDraft || (! $hasJournal && $insideSession);
            $availabilityMessage = $hasOpenDraft
                ? 'Draf jurnal sudah tersimpan dan dapat diperbarui.'
                : ($hasJournal
                    ? match ($journalStatus) {
                        'final' => 'Jurnal sudah difinalisasi.',
                        'finalisasi_susulan' => 'Jurnal sudah difinalisasi sebagai susulan.',
                        'kedaluwarsa' => 'Batas 48 jam telah lewat. Jurnal kedaluwarsa.',
                        default => null,
                    }
                    : ($now->lt($journalStartsAt)
                        ? 'Draf jurnal dapat diisi mulai pukul '.$journalStartsAt->format('H:i').'.'
                        : ($now->gt($scheduleEndsAt) ? 'Waktu pengisian draf berakhir pukul '.$scheduleEndsAt->format('H:i').'.' : null)));
            $canFinalizeJournal = $hasOpenDraft || (! $hasJournal && $insideFinalizationWindow);
            if ($hasOpenDraft) {
                $finalizationMessage = $now->lt($finalizationStartsAt)
                    ? 'Draf aktif. Finalisasi dibuka pukul '.$finalizationStartsAt->format('H:i').'.'
                    : 'Draf aktif. Finalisasi masih dapat dilakukan.';
            } else {
                $finalizationMessage = $now->lt($finalizationStartsAt)
                    ? 'Finalisasi dibuka pukul '.$finalizationStartsAt->format('H:i').'.'
                    : ($now->gt($scheduleEndsAt) ? 'Finalisasi ditutup pukul '.$scheduleEndsAt->format('H:i').'.' : 'Finalisasi harus dilakukan sebelum jadwal berakhir pukul '.$scheduleEndsAt->format('H:i').'.');
            }
            $schedule->setAttribute('can_fill_journal', $canFillJournal);
            $schedule->setAttribute('journal_availability_message', $availabilityMessage);
            $schedule->setAttribute('can_finalize_journal', $canFinalizeJournal);
            $schedule->setAttribute('journal_finalization_message', $finalizationMessage);
            unset($schedule->jurnalMengajars);

            return $schedule;
        });

        return response()->json([
            'data' => $data,
            'meta' => [
                'tanggal' => $now->toDateString(),
                'hari' => $weekday,
                'tahun_ajaran' => $year->tahun_ajaran,
                'semester' => $semester,
                'siklus_minggu' => $cycle,
                'agenda_override' => $agendas->pluck('nama_agenda'),
                'hari_libur' => $holiday ? ['nama' => $holiday->nama, 'jenis' => $holiday->jenis] : null,
            ],
        ]);
    }

    /**
     * Endpoint GET /api/v1/teacher/schedules/announcements.
     * Mengambil agenda sekolah yang akan datang untuk ditampilkan pada dashboard atau panel pengumuman guru.
     */
    public function announcements()
    {
        $today = now(config('app.timezone'))->toDateString();
        $announcements = AgendaSekolah::query()
            ->whereDate('tanggal', '>=', $today)
            ->where('scope', 'SEKOLAH')
            ->orderBy('tanggal')
            ->orderBy('jam_mulai')
            ->limit(30)
            ->get(['id', 'nama_agenda', 'tanggal', 'jam_mulai', 'jam_selesai', 'override_kbm']);

        return response()->json(['data' => $announcements]);
    }
}
