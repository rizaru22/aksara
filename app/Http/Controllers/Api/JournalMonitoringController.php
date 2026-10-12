<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JurnalMengajar;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class JournalMonitoringController extends Controller
{
    /**
     * Mapping status_sesi ke label yang ditampilkan ke admin.
     */
    private const STATUS_LABEL = [
        'berlangsung' => 'Draft',
        'selesai'     => 'Final',
        'flagged'     => 'Flagged',
    ];

    /**
     * GET /api/v1/admin/journal-monitoring
     *
     * Daftar jurnal mengajar per tanggal untuk monitoring admin.
     * Query param:
     *   - tanggal (date, default: hari ini di timezone app)
     *   - status  (optional: berlangsung|selesai|flagged)
     *   - search  (optional: nama guru / nama kelas / materi pembahasan)
     */
    public function index(Request $request): JsonResponse
    {
        abort_unless(
            $request->user()->hasRole('admin')
                || $request->user()->can('kelola-master-data')
                || $request->user()->can('view-dashboard-kurikulum'),
            403
        );

        $validated = $request->validate([
            'tanggal' => ['nullable', 'date'],
            'status'  => ['nullable', 'in:berlangsung,selesai,flagged'],
            'search'  => ['nullable', 'string', 'max:255'],
        ]);

        $tanggal = $validated['tanggal']
            ?? Carbon::now(config('app.timezone'))->toDateString();
        $status  = $validated['status'] ?? null;
        $search  = $validated['search'] ?? null;

        // --- Build query (anti N+1) ---
        $query = JurnalMengajar::query()
            ->whereDate('tanggal', $tanggal)
            ->with([
                'guru:id,nama,nip',
                'guruPengganti:id,nama,nip',
                'jadwalPelajaran:id,jam_mulai,jam_selesai,kelas_id,mata_pelajaran_id,user_id',
                'jadwalPelajaran.kelas:id,nama_kelas',
                'jadwalPelajaran.mataPelajaran:id,nama_mapel',
            ])
            ->withCount('presensiSiswas');

        if ($status !== null) {
            $query->where('status_sesi', $status);
        }

        if ($search !== null) {
            $query->where(function ($q) use ($search): void {
                $q->whereHas('guru', fn ($g) => $g->where('nama', 'like', "%{$search}%"))
                  ->orWhereHas('jadwalPelajaran.kelas', fn ($k) => $k->where('nama_kelas', 'like', "%{$search}%"))
                  ->orWhere('materi_pembahasan', 'like', "%{$search}%");
            });
        }

        $journals = $query->get();

        // --- Resolve total_siswa per kelas (batch, anti N+1) ---
        $kelasIds = $journals
            ->pluck('jadwalPelajaran.kelas_id')
            ->filter()
            ->unique()
            ->values()
            ->all();

        // [ kelas_id => jumlah_siswa ]
        $siswaCounts = collect();
        if (!empty($kelasIds)) {
            $siswaCounts = DB::table('siswas')
                ->whereIn('kelas_id', $kelasIds)
                ->select('kelas_id', DB::raw('count(*) as total'))
                ->groupBy('kelas_id')
                ->pluck('total', 'kelas_id');
        }

        // --- Build response data + compute summary ---
        $totalCount       = 0;
        $finalCount       = 0;
        $draftCount       = 0;
        $belumLengkapCount = 0;

        $data = $journals->map(function (JurnalMengajar $journal) use ($siswaCounts, &$totalCount, &$finalCount, &$draftCount, &$belumLengkapCount): array {
            $totalCount++;

            $jadwal      = $journal->jadwalPelajaran;
            $kelasId     = $jadwal?->kelas_id;
            $totalSiswa  = (int) ($siswaCounts[$kelasId] ?? 0);
            $presensiCount = (int) $journal->presensi_siswas_count;
            $lengkap     = $totalSiswa > 0 && $presensiCount === $totalSiswa;

            if ($journal->status_sesi === 'selesai') {
                $finalCount++;
            } else {
                $draftCount++;
            }

            if ($journal->status_sesi !== 'selesai' && !$lengkap) {
                $belumLengkapCount++;
            }

            return [
                'id'                    => $journal->id,
                'tanggal'               => $journal->tanggal instanceof \Carbon\Carbon
                    ? $journal->tanggal->toDateString()
                    : (string) $journal->tanggal,
                'status_sesi'           => $journal->status_sesi,
                'status_label'          => self::STATUS_LABEL[$journal->status_sesi] ?? $journal->status_sesi,
                'materi_pembahasan'     => $journal->materi_pembahasan,
                'catatan_kejadian_kelas' => $journal->catatan_kejadian_kelas,
                'jam_mulai'             => $jadwal?->jam_mulai,
                'jam_selesai'           => $jadwal?->jam_selesai,
                'guru'                  => $journal->guru ? [
                    'id'   => $journal->guru->id,
                    'nama' => $journal->guru->nama,
                    'nip'  => $journal->guru->nip,
                ] : null,
                'guru_pengganti'        => $journal->guruPengganti ? [
                    'id'   => $journal->guruPengganti->id,
                    'nama' => $journal->guruPengganti->nama,
                    'nip'  => $journal->guruPengganti->nip,
                ] : null,
                'kelas'                 => $jadwal?->kelas ? [
                    'id'         => $jadwal->kelas->id,
                    'nama_kelas' => $jadwal->kelas->nama_kelas,
                ] : null,
                'mata_pelajaran'        => $jadwal?->mataPelajaran ? [
                    'id'        => $jadwal->mataPelajaran->id,
                    'nama_mapel' => $jadwal->mataPelajaran->nama_mapel,
                ] : null,
                'presensi_count'        => $presensiCount,
                'total_siswa'           => $totalSiswa,
                'lengkap'               => $lengkap,
                'has_foto'              => (bool) $journal->foto_kegiatan,
                'jam_mulai_realisasi'   => $journal->jam_mulai_realisasi,
                'jam_selesai_realisasi' => $journal->jam_selesai_realisasi,
                'updated_at'            => $journal->updated_at?->toIso8601String(),
                'created_at'            => $journal->created_at?->toIso8601String(),
            ];
        });

        return response()->json([
            'summary' => [
                'total'         => $totalCount,
                'final'         => $finalCount,
                'draft'         => $draftCount,
                'belum_lengkap' => $belumLengkapCount,
            ],
            'data'    => $data,
            'filters' => [
                'tanggal' => $tanggal,
                'status'  => $status,
                'search'  => $search,
            ],
        ]);
    }

    /**
     * GET /api/v1/admin/journal-monitoring/{jurnalMengajar}
     *
     * Detail satu jurnal mengajar beserta presensi siswa dan analisis kelengkapan.
     */
    public function show(Request $request, JurnalMengajar $jurnalMengajar): JsonResponse
    {
        abort_unless(
            $request->user()->hasRole('admin')
                || $request->user()->can('kelola-master-data')
                || $request->user()->can('view-dashboard-kurikulum'),
            403
        );

        $jurnalMengajar->load([
            'guru:id,nama,nip',
            'guruPengganti:id,nama,nip',
            'jadwalPelajaran:id,jam_mulai,jam_selesai,kelas_id,mata_pelajaran_id,user_id',
            'jadwalPelajaran.kelas:id,nama_kelas',
            'jadwalPelajaran.mataPelajaran:id,nama_mapel',
            'presensiSiswas.siswa:id,nama,nisn',
        ]);

        $jadwal      = $jurnalMengajar->jadwalPelajaran;
        $kelasId     = $jadwal?->kelas_id;

        $totalSiswa  = $kelasId
            ? (int) DB::table('siswas')->where('kelas_id', $kelasId)->count()
            : 0;

        $presensiCount = $jurnalMengajar->presensiSiswas->count();
        $lengkap       = $totalSiswa > 0 && $presensiCount === $totalSiswa;

        // --- Analisis kelengkapan ---
        $bagianBelumLengkap = [];

        if (! $jurnalMengajar->materi_pembahasan) {
            $bagianBelumLengkap[] = 'Materi pembahasan belum diisi';
        }

        if (! $lengkap) {
            $bagianBelumLengkap[] = "Presensi belum lengkap ({$presensiCount}/{$totalSiswa} siswa)";
        }

        if (! $jurnalMengajar->foto_kegiatan && $jurnalMengajar->status_sesi === 'berlangsung') {
            $bagianBelumLengkap[] = 'Foto kegiatan belum diisi';
        }

        if (! $jurnalMengajar->jam_selesai_realisasi && $jurnalMengajar->status_sesi === 'berlangsung') {
            $bagianBelumLengkap[] = 'Waktu selesai belum dicatat';
        }

        // --- Format presensi siswa ---
        $presensiData = $jurnalMengajar->presensiSiswas->map(fn ($p) => [
            'id'         => $p->id,
            'siswa_id'   => $p->siswa_id,
            'siswa'      => [
                'id'   => $p->siswa_id,
                'nama' => $p->siswa?->nama,
                'nisn' => $p->siswa?->nisn,
            ],
            'nama'       => $p->siswa?->nama,
            'nisn'       => $p->siswa?->nisn,
            'status'     => $p->status,
            'keterangan' => $p->keterangan,
        ]);

        $presensiSiswaData = $presensiData->values();

        $tanggal = $jurnalMengajar->tanggal instanceof \Carbon\Carbon
            ? $jurnalMengajar->tanggal->toDateString()
            : (string) $jurnalMengajar->tanggal;

        return response()->json([
            'data' => [
                'id'                     => $jurnalMengajar->id,
                'tanggal'                => $tanggal,
                'status_sesi'            => $jurnalMengajar->status_sesi,
                'status_label'           => self::STATUS_LABEL[$jurnalMengajar->status_sesi] ?? $jurnalMengajar->status_sesi,
                'materi_pembahasan'      => $jurnalMengajar->materi_pembahasan,
                'catatan_kejadian_kelas' => $jurnalMengajar->catatan_kejadian_kelas,
                'catatan_penutupan'      => $jurnalMengajar->catatan_penutupan,
                'jam_mulai'              => $jadwal?->jam_mulai,
                'jam_selesai'            => $jadwal?->jam_selesai,
                'jam_mulai_realisasi'    => $jurnalMengajar->jam_mulai_realisasi,
                'jam_selesai_realisasi'  => $jurnalMengajar->jam_selesai_realisasi,
                'lat_finalisasi'         => $jurnalMengajar->lat_finalisasi,
                'long_finalisasi'        => $jurnalMengajar->long_finalisasi,
                'gps_accuracy_finalisasi' => $jurnalMengajar->gps_accuracy_finalisasi,
                'jarak_geofence_finalisasi' => $jurnalMengajar->jarak_geofence_finalisasi,
                'guru'                   => $jurnalMengajar->guru ? [
                    'id'   => $jurnalMengajar->guru->id,
                    'nama' => $jurnalMengajar->guru->nama,
                    'nip'  => $jurnalMengajar->guru->nip,
                ] : null,
                'guru_pengganti'         => $jurnalMengajar->guruPengganti ? [
                    'id'   => $jurnalMengajar->guruPengganti->id,
                    'nama' => $jurnalMengajar->guruPengganti->nama,
                    'nip'  => $jurnalMengajar->guruPengganti->nip,
                ] : null,
                'kelas'                  => $jadwal?->kelas ? [
                    'id'         => $jadwal->kelas->id,
                    'nama_kelas' => $jadwal->kelas->nama_kelas,
                ] : null,
                'mata_pelajaran'         => $jadwal?->mataPelajaran ? [
                    'id'         => $jadwal->mataPelajaran->id,
                    'nama_mapel' => $jadwal->mataPelajaran->nama_mapel,
                ] : null,
                'presensi'               => $presensiSiswaData,
                'presensi_siswas'        => $presensiSiswaData,
                'presensi_count'         => $presensiCount,
                'total_siswa'            => $totalSiswa,
                'lengkap'                => $lengkap,
                'has_foto'               => (bool) $jurnalMengajar->foto_kegiatan,
                'bagian_belum_lengkap'   => $bagianBelumLengkap,
                'updated_at'             => $jurnalMengajar->updated_at?->toIso8601String(),
                'created_at'             => $jurnalMengajar->created_at?->toIso8601String(),
            ],
        ]);
    }
}

