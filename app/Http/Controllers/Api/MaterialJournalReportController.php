<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JadwalPelajaran;
use App\Models\JurnalMengajar;
use App\Models\TahunAjaran;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaterialJournalReportController extends Controller
{
    /**
     * Rekap materi jurnal pada tahun ajaran aktif.
     * Opsi filter dan data laporan selalu bersumber dari jadwal pada tahun ajaran aktif.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            $user->hasAnyRole(['admin', 'kurikulum', 'kepsek'])
                || $user->can('kelola-master-data')
                || $user->can('view-dashboard-kurikulum'),
            403
        );

        $filters = $request->validate([
            'teacher_id' => ['nullable', 'integer', 'exists:users,id'],
            'subject_id' => ['nullable', 'integer', 'exists:mata_pelajarans,id'],
            'class_id' => ['nullable', 'integer', 'exists:kelas,id'],
            'semester' => ['nullable', 'in:Ganjil,Genap'],
        ]);

        $activeYear = TahunAjaran::query()->where('is_active', true)->first();
        if (! $activeYear) {
            return response()->json([
                'data' => [
                    'academic_year' => null,
                    'filters' => ['teachers' => [], 'subjects' => [], 'classes' => []],
                    'journals' => [],
                    'message' => 'Belum ada tahun ajaran aktif. Aktifkan tahun ajaran terlebih dahulu.',
                ],
            ]);
        }

        $scheduleQuery = JadwalPelajaran::query()
            ->where('jadwal_pelajarans.tahun_ajaran_id', $activeYear->id)
            ->when(isset($filters['semester']), fn ($q) => $q->where('semester', $filters['semester']))
            ->when(isset($filters['teacher_id']), fn ($q) => $q->where('user_id', $filters['teacher_id']))
            ->when(isset($filters['subject_id']), fn ($q) => $q->where('mata_pelajaran_id', $filters['subject_id']))
            ->when(isset($filters['class_id']), fn ($q) => $q->where('kelas_id', $filters['class_id']));

        $teachers = (clone $scheduleQuery)
            ->join('users', 'users.id', '=', 'jadwal_pelajarans.user_id')
            ->select('users.id', 'users.nama', 'users.nip')
            ->distinct()
            ->orderBy('users.nama')
            ->get();

        $subjects = (clone $scheduleQuery)
            ->join('mata_pelajarans', 'mata_pelajarans.id', '=', 'jadwal_pelajarans.mata_pelajaran_id')
            ->select('mata_pelajarans.id', 'mata_pelajarans.nama_mapel', 'mata_pelajarans.kode_mapel')
            ->distinct()
            ->orderBy('mata_pelajarans.nama_mapel')
            ->get();

        $classes = (clone $scheduleQuery)
            ->join('kelas', 'kelas.id', '=', 'jadwal_pelajarans.kelas_id')
            ->select('kelas.id', 'kelas.nama_kelas')
            ->distinct()
            ->orderBy('kelas.nama_kelas')
            ->get();

        $journals = collect();
        $message = null;
        if (! empty($filters['teacher_id']) && ! empty($filters['subject_id']) && ! empty($filters['class_id']) && ! empty($filters['semester'])) {
            $scheduleIds = (clone $scheduleQuery)->select('jadwal_pelajarans.id')->pluck('jadwal_pelajarans.id');
            $journals = JurnalMengajar::query()
                ->whereIn('jadwal_pelajaran_id', $scheduleIds)
                ->with(['guru:id,nama,nip', 'jadwalPelajaran:id,semester,jam_mulai,jam_selesai,kelas_id,mata_pelajaran_id,user_id', 'jadwalPelajaran.kelas:id,nama_kelas', 'jadwalPelajaran.mataPelajaran:id,nama_mapel', 'materiPelajaran:id,urutan_bab,judul_bab'])
                ->orderBy('tanggal')
                ->orderByRaw('COALESCE(waktu_rencana_mulai, jam_mulai_realisasi) ASC')
                ->orderBy('id')
                ->get()
                ->map(fn (JurnalMengajar $journal) => [
                    'id' => $journal->id,
                    'tanggal' => $journal->tanggal instanceof \Carbon\Carbon ? $journal->tanggal->toDateString() : (string) $journal->tanggal,
                    'jam_mulai' => $journal->waktu_rencana_mulai?->format('H:i') ?? ($journal->jam_mulai_realisasi ? \Carbon\Carbon::parse($journal->jam_mulai_realisasi)->format('H:i') : null) ?? $journal->jadwalPelajaran?->jam_mulai,
                    'jam_selesai' => $journal->waktu_rencana_selesai?->format('H:i') ?? ($journal->jam_selesai_realisasi ? \Carbon\Carbon::parse($journal->jam_selesai_realisasi)->format('H:i') : null) ?? $journal->jadwalPelajaran?->jam_selesai,
                    'materi_pelajaran' => $journal->materiPelajaran ? trim(($journal->materiPelajaran->urutan_bab ? 'Bab '.$journal->materiPelajaran->urutan_bab.' — ' : '').$journal->materiPelajaran->judul_bab) : null,
                    'materi_pembahasan' => $journal->materi_pembahasan,
                    'catatan' => $journal->catatan_kejadian_kelas,
                    'status' => $journal->status_sesi,
                    'guru' => $journal->guru?->nama,
                    'kelas' => $journal->jadwalPelajaran?->kelas?->nama_kelas,
                    'mapel' => $journal->jadwalPelajaran?->mataPelajaran?->nama_mapel,
                ])->values();

            if ($journals->isEmpty()) {
                $message = 'Belum ada jurnal mengajar untuk kombinasi filter dan semester ini.';
            }
        }

        return response()->json([
            'data' => [
                'academic_year' => $activeYear->tahun_ajaran,
                'academic_year_id' => $activeYear->id,
                'filters' => [
                    'teachers' => $teachers,
                    'subjects' => $subjects,
                    'classes' => $classes,
                ],
                'journals' => $journals,
                'message' => $message,
            ],
        ]);
    }
}
