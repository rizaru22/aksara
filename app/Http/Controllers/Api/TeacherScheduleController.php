<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaSekolah;
use App\Models\HariLibur;
use App\Models\JadwalPelajaran;
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

        $schedules = ($holiday || $isSunday) ? collect() : JadwalPelajaran::query()
            ->with(['kelas:id,nama_kelas,tingkat,jurusan', 'mataPelajaran:id,kode_mapel,nama_mapel', 'tahunAjaran:id,tahun_ajaran'])
            ->with(['jurnalMengajars' => fn ($query) => $query->whereDate('tanggal', $now->toDateString())->with('presensiSiswas')])
            ->where('user_id', $request->user()->id)
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
            $schedule->setAttribute('jurnal_hari_ini', $schedule->jurnalMengajars->first());
            $agenda = $agendas->first(fn (AgendaSekolah $item) => $item->jam_mulai < $schedule->jam_selesai && $item->jam_selesai > $schedule->jam_mulai);
            $schedule->setAttribute('kbm_ditangguhkan', (bool) $agenda);
            $schedule->setAttribute('agenda_pengganti', $agenda?->nama_agenda);
            $journalStartsAt = Carbon::parse($now->toDateString().' '.$schedule->jam_mulai, config('app.timezone'));
            $scheduleEndsAt = Carbon::parse($now->toDateString().' '.$schedule->jam_selesai, config('app.timezone'));
            $finalizationStartsAt = $scheduleEndsAt->copy()->subMinutes(30);
            if ($finalizationStartsAt->lt($journalStartsAt)) $finalizationStartsAt = $journalStartsAt;
            $hasOpenDraft = $schedule->jurnal_hari_ini?->status_sesi === 'berlangsung';
            $canFillJournal = $hasOpenDraft || (! $now->lt($journalStartsAt) && ! $now->gt($scheduleEndsAt));
            $availabilityMessage = $now->lt($journalStartsAt)
                ? 'Draf jurnal dapat diisi mulai pukul '.$journalStartsAt->format('H:i').'.'
                : ($now->gt($scheduleEndsAt) && ! $hasOpenDraft ? 'Waktu pengisian draf berakhir pukul '.$scheduleEndsAt->format('H:i').'.' : null);
            $canFinalizeJournal = $hasOpenDraft || (! $now->lt($finalizationStartsAt) && ! $now->gt($scheduleEndsAt));
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
