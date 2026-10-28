<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JadwalPelajaran;
use App\Models\Kelas;
use App\Models\PresensiSiswa;
use App\Models\Siswa;
use App\Models\TahunAjaran;
use Illuminate\Http\Request;

class WaliKelasController extends Controller
{
    /**
     * Ringkasan kelas perwalian pada tahun ajaran aktif.
     */
    public function overview(Request $request)
    {
        $user = $request->user();
        $activeYear = TahunAjaran::query()->where('is_active', true)->first();

        $classes = Kelas::query()
            ->where('wali_kelas_id', $user->id)
            ->when($activeYear, fn ($query) => $query->where('tahun_ajaran_id', $activeYear->id))
            ->with(['tahunAjaran:id,tahun_ajaran,is_active'])
            ->withCount(['penempatans' => fn ($query) => $query->whereHas('siswa', fn ($student) => $student->whereDoesntHave('arsip'))])
            ->orderBy('nama_kelas')
            ->get(['id', 'nama_kelas', 'tingkat', 'jurusan', 'wali_kelas_id', 'tahun_ajaran_id']);

        return response()->json([
            'data' => [
                'academic_year' => $activeYear?->tahun_ajaran,
                'classes' => $classes,
                'total_classes' => $classes->count(),
                'total_students' => $classes->sum('penempatans_count'),
            ],
        ]);
    }

    /**
     * Daftar siswa hanya dari kelas yang ditugaskan kepada user dan tahun ajaran aktif.
     */
    public function students(Request $request, Kelas $kelas)
    {
        $this->authorizeClass($request, $kelas);
        $activeYear = TahunAjaran::query()->where('is_active', true)->first();

        $students = Siswa::query()
            ->whereDoesntHave('arsip')
            ->whereHas('penempatans', fn ($query) => $query
                ->where('kelas_id', $kelas->id)
                ->when($activeYear, fn ($placement) => $placement->where('tahun_ajaran_id', $activeYear->id)))
            ->orderBy('nama')
            ->get(['id', 'nisn', 'nama', 'jenis_kelamin']);

        return response()->json([
            'data' => [
                'class' => $kelas->only(['id', 'nama_kelas', 'tingkat', 'jurusan']),
                'academic_year' => $activeYear?->tahun_ajaran,
                'students' => $students,
                'total_students' => $students->count(),
            ],
        ]);
    }

    /**
     * Jadwal pembelajaran yang terkait dengan kelas perwalian pada tahun ajaran aktif.
     */
    public function schedules(Request $request, Kelas $kelas)
    {
        $this->authorizeClass($request, $kelas);
        $activeYear = TahunAjaran::query()->where('is_active', true)->first();

        $schedules = JadwalPelajaran::query()
            ->where('kelas_id', $kelas->id)
            ->when($activeYear, fn ($query) => $query->where('tahun_ajaran_id', $activeYear->id))
            ->with(['guru:id,nama', 'mataPelajaran:id,nama_mapel', 'tahunAjaran:id,tahun_ajaran'])
            ->orderByRaw("FIELD(hari, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu')")
            ->orderBy('jam_mulai')
            ->get();

        return response()->json([
            'data' => [
                'class' => $kelas->only(['id', 'nama_kelas', 'tingkat', 'jurusan']),
                'academic_year' => $activeYear?->tahun_ajaran,
                'schedules' => $schedules,
            ],
        ]);
    }

    /**
     * Rekap presensi bulanan untuk siswa pada kelas perwalian.
     */
    public function attendance(Request $request, Kelas $kelas)
    {
        $this->authorizeClass($request, $kelas);
        $filters = $request->validate(['month' => ['required', 'date_format:Y-m']]);
        [$year, $month] = array_map('intval', explode('-', $filters['month']));
        $activeYear = TahunAjaran::query()->where('is_active', true)->first();

        $students = Siswa::query()
            ->whereDoesntHave('arsip')
            ->whereHas('penempatans', fn ($query) => $query
                ->where('kelas_id', $kelas->id)
                ->when($activeYear, fn ($placement) => $placement->where('tahun_ajaran_id', $activeYear->id)))
            ->orderBy('nama')
            ->get(['id', 'nisn', 'nama']);

        $records = PresensiSiswa::query()
            ->whereIn('siswa_id', $students->modelKeys())
            ->whereHas('jurnalMengajar', fn ($query) => $query
                ->whereYear('tanggal', $year)
                ->whereMonth('tanggal', $month)
                ->whereHas('jadwalPelajaran', fn ($schedule) => $schedule->where('kelas_id', $kelas->id)))
            ->with('jurnalMengajar:id,tanggal,jadwal_pelajaran_id')
            ->get(['id', 'siswa_id', 'jurnal_mengajar_id', 'status']);

        $byStudent = $records->groupBy('siswa_id');
        $rows = $students->map(function (Siswa $student) use ($byStudent): array {
            $studentRecords = $byStudent->get($student->id, collect());
            $counts = ['HADIR' => 0, 'SAKIT' => 0, 'IZIN' => 0, 'ALPHA' => 0, 'CABUT' => 0];
            foreach ($studentRecords as $record) {
                $status = strtoupper((string) $record->status);
                if (array_key_exists($status, $counts)) $counts[$status]++;
            }

            return [
                'id' => $student->id,
                'nisn' => $student->nisn,
                'nama' => $student->nama,
                'hadir' => $counts['HADIR'],
                'sakit' => $counts['SAKIT'],
                'izin' => $counts['IZIN'],
                'alpha' => $counts['ALPHA'],
                'cabut' => $counts['CABUT'],
                'total' => $studentRecords->count(),
                'persentase_hadir' => $studentRecords->isNotEmpty()
                    ? round(($counts['HADIR'] / $studentRecords->count()) * 100, 2)
                    : 0,
            ];
        })->values();

        return response()->json([
            'data' => [
                'class' => $kelas->only(['id', 'nama_kelas', 'tingkat', 'jurusan']),
                'academic_year' => $activeYear?->tahun_ajaran,
                'month' => $filters['month'],
                'summary' => [
                    'total_students' => $rows->count(),
                    'total_sessions' => $records->pluck('jurnal_mengajar_id')->unique()->count(),
                    'total_records' => $records->count(),
                    'hadir' => $records->where('status', 'HADIR')->count(),
                    'sakit' => $records->where('status', 'SAKIT')->count(),
                    'izin' => $records->where('status', 'IZIN')->count(),
                    'alpha' => $records->where('status', 'ALPHA')->count(),
                    'cabut' => $records->where('status', 'CABUT')->count(),
                ],
                'students' => $rows,
            ],
        ]);
    }

    private function authorizeClass(Request $request, Kelas $kelas): void
    {
        abort_unless((int) $kelas->wali_kelas_id === (int) $request->user()->id, 403, 'Akses hanya tersedia untuk kelas yang ditugaskan kepada Anda sebagai wali kelas.');
        $activeYear = TahunAjaran::query()->where('is_active', true)->first();
        abort_unless($activeYear && (int) $kelas->tahun_ajaran_id === (int) $activeYear->id, 403, 'Kelas tidak termasuk tahun ajaran aktif.');
    }
}
