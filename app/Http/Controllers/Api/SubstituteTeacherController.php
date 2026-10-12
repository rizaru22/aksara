<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JadwalPelajaran;
use App\Models\PengajuanGuruPengganti;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;

class SubstituteTeacherController extends Controller
{
    /**
     * Endpoint GET /api/v1/teacher/substitute-requests/mine.
     * Menampilkan semua pengajuan guru pengganti yang dibuat oleh guru utama agar dapat dipantau statusnya.
     */
    public function mine(Request $request)
    {
        $user = $request->user();

        $requests = PengajuanGuruPengganti::query()
            ->with(['jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran', 'guruPengganti:id,nama,nip', 'approver:id,nama'])
            ->where('user_id', $user->id)
            ->orderByDesc('tanggal')
            ->get();

        return response()->json(['data' => $requests]);
    }

    /**
     * Endpoint GET /api/v1/admin/substitute-requests.
     * Menyediakan daftar pengajuan guru pengganti yang menunggu persetujuan admin atau pihak yang berwenang.
     */
    public function index(Request $request)
    {
        abort_unless($request->user()->hasRole(['admin', 'kepsek', 'kurikulum']) || $request->user()->can('kelola-master-data'), 403);

        $validated = $request->validate([
            'status_approval' => ['sometimes', 'in:PENDING,APPROVED,REJECTED'],
            'tanggal' => ['sometimes', 'date'],
        ]);

        $query = PengajuanGuruPengganti::query()
            ->with(['guruUtama:id,nama,nip', 'guruPengganti:id,nama,nip', 'jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran'])
            ->latest('tanggal');

        if (isset($validated['status_approval'])) {
            $query->where('status_approval', $validated['status_approval']);
        }

        if (isset($validated['tanggal'])) {
            $query->whereDate('tanggal', $validated['tanggal']);
        }

        return response()->json(['data' => $query->get()]);
    }

    /**
     * Endpoint POST /api/v1/teacher/substitute-requests.
     * Memungkinkan guru utama mengajukan pengganti untuk satu sesi tertentu, misalnya saat berhalangan hadir atau perlu cuti mendadak.
     */
    public function store(Request $request)
    {

        $data = $request->validate([
            'jadwal_pelajaran_id' => ['required', 'integer', 'exists:jadwal_pelajarans,id'],
            'guru_pengganti_id' => ['required', 'integer', 'exists:users,id'],
            'tanggal' => ['required', 'date'],
            'alasan' => ['required', 'string', 'min:10', 'max:2000'],
        ]);

        $schedule = JadwalPelajaran::query()->with('guru')->findOrFail($data['jadwal_pelajaran_id']);
        // Izinkan aksi jika user memiliki permission `isi-ejurnal` atau jika dia memang pemilik jadwal (guru utama).
        abort_unless($request->user()->can('isi-ejurnal') || $schedule->user_id === $request->user()->id, 403);
        if ($schedule->user_id !== $request->user()->id) {
            abort(403, 'Hanya guru utama yang memiliki jadwal ini yang dapat mengajukan pengganti.');
        }

        $substitute = User::query()->findOrFail($data['guru_pengganti_id']);
        if ($substitute->id === $request->user()->id) {
            abort(422, 'Guru pengganti tidak boleh sama dengan guru utama.');
        }

        $requestDate = Carbon::parse($data['tanggal'], config('app.timezone'));

        $existing = PengajuanGuruPengganti::query()
            ->where('jadwal_pelajaran_id', $schedule->id)
            ->whereDate('tanggal', $requestDate->toDateString())
            ->first();

        if ($existing) {
            $existing->update([
                'guru_pengganti_id' => $substitute->id,
                'alasan' => $data['alasan'],
                'status_approval' => 'PENDING',
                'catatan_admin' => null,
                'approved_by_user_id' => null,
                'approved_at' => null,
            ]);

            return response()->json(['message' => 'Pengajuan guru pengganti berhasil diperbarui.', 'data' => $existing], 200);
        }

        $requestModel = PengajuanGuruPengganti::query()->create([
            'user_id' => $request->user()->id,
            'jadwal_pelajaran_id' => $schedule->id,
            'guru_pengganti_id' => $substitute->id,
            'tanggal' => $requestDate->toDateString(),
            'alasan' => $data['alasan'],
            'status_approval' => 'PENDING',
        ]);

        return response()->json(['message' => 'Pengajuan guru pengganti berhasil dikirim.', 'data' => $requestModel], 201);
    }

    /**
     * Endpoint PATCH /api/v1/admin/substitute-requests/{pengajuanGuruPengganti}.
     * Admin menyetujui atau menolak pengajuan guru pengganti untuk satu sesi tertentu.
     */
    public function decide(Request $request, PengajuanGuruPengganti $pengajuanGuruPengganti)
    {
        abort_unless($request->user()->hasRole(['admin', 'kepsek', 'kurikulum']) || $request->user()->can('kelola-master-data'), 403);

        $data = $request->validate([
            'status_approval' => ['required', 'in:APPROVED,REJECTED'],
            'catatan_admin' => ['nullable', 'string', 'max:2000'],
        ]);

        $pengajuanGuruPengganti->fill([
            'status_approval' => $data['status_approval'],
            'catatan_admin' => $data['catatan_admin'] ?? null,
            'approved_by_user_id' => $request->user()->id,
            'approved_at' => now(config('app.timezone')),
        ])->save();

        return response()->json([
            'message' => $data['status_approval'] === 'APPROVED' ? 'Pengajuan guru pengganti disetujui.' : 'Pengajuan guru pengganti ditolak.',
            'data' => $pengajuanGuruPengganti->fresh(['guruUtama:id,nama,nip', 'guruPengganti:id,nama,nip', 'jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran']),
        ]);
    }

    /**
     * Endpoint GET /api/v1/teacher/substitute-candidates.
     * Mengambil daftar guru yang dapat dipilih sebagai pengganti.
     */
    public function candidates(Request $request)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);

        $teachers = User::whereHas('roles', function ($query) {
            $query->whereIn('name', ['guru', 'kurikulum', 'kepsek']);
        })
            ->whereKeyNot($request->user()->id)
            ->orderBy('nama')
            ->get(['id', 'nama', 'nip']);

        return response()->json(['data' => $teachers]);
    }
}

