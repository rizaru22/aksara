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
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class TeacherScheduleController extends Controller
{
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

        $data = $schedules->map(function (JadwalPelajaran $schedule) use ($agendas) {
            $schedule->setAttribute('jurnal_hari_ini', $schedule->jurnalMengajars->first());
            $agenda = $agendas->first(fn (AgendaSekolah $item) => $item->jam_mulai < $schedule->jam_selesai && $item->jam_selesai > $schedule->jam_mulai);
            $schedule->setAttribute('kbm_ditangguhkan', (bool) $agenda);
            $schedule->setAttribute('agenda_pengganti', $agenda?->nama_agenda);
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
