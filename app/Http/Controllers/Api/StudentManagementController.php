<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArsipSiswa;
use App\Models\Kelas;
use App\Models\PenempatanSiswa;
use App\Models\Siswa;
use App\Models\TahunAjaran;
use App\Services\StudentPlacementService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class StudentManagementController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->can('kelola-master-data'), 403);
        $filters = $request->validate([
            'tahun_ajaran_id' => ['nullable', 'integer', 'exists:tahun_ajarans,id'],
            'kelas_id' => ['nullable', 'integer', 'exists:kelas,id'],
            'include_archived' => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:100'],
        ]);
        $query = Siswa::query()->with(['penempatans.kelas:id,nama_kelas,tingkat,jurusan,tahun_ajaran_id', 'penempatans.tahunAjaran:id,tahun_ajaran,is_active', 'arsip']);
        if (empty($filters['include_archived'])) $query->whereDoesntHave('arsip');
        if (!empty($filters['search'])) {
            $search = $filters['search'];
            $query->where(fn ($q) => $q->where('nama', 'like', "%{$search}%")->orWhere('nisn', 'like', "%{$search}%"));
        }
        if (!empty($filters['tahun_ajaran_id']) || !empty($filters['kelas_id'])) {
            $query->whereHas('penempatans', function ($q) use ($filters) {
                if (!empty($filters['tahun_ajaran_id'])) $q->where('tahun_ajaran_id', $filters['tahun_ajaran_id']);
                if (!empty($filters['kelas_id'])) $q->where('kelas_id', $filters['kelas_id']);
            });
        }
        return response()->json($query->orderBy('nama')->paginate(30));
    }

    public function place(Request $request, StudentPlacementService $service)
    {
        abort_unless($request->user()->can('kelola-master-data'), 403);
        $data = $request->validate([
            'siswa_id' => ['required', 'integer', 'exists:siswas,id'],
            'kelas_id' => ['required', 'integer', 'exists:kelas,id'],
            'tahun_ajaran_id' => ['required', 'integer', 'exists:tahun_ajarans,id'],
        ]);
        $placement = $service->place((int) $data['siswa_id'], (int) $data['kelas_id'], (int) $data['tahun_ajaran_id']);
        return response()->json(['message' => 'Penempatan siswa berhasil disimpan.', 'data' => $placement->load(['siswa:id,nisn,nama,jenis_kelamin', 'kelas:id,nama_kelas,tahun_ajaran_id', 'tahunAjaran:id,tahun_ajaran'])]);
    }

    public function promote(Request $request, StudentPlacementService $service)
    {
        abort_unless($request->user()->can('kelola-master-data'), 403);
        $data = $request->validate([
            'tahun_ajaran_tujuan_id' => ['required', 'integer', 'exists:tahun_ajarans,id'],
            'placements' => ['required', 'array', 'min:1', 'max:1000'],
            'placements.*.siswa_id' => ['required', 'integer', 'distinct', 'exists:siswas,id'],
            'placements.*.kelas_id' => ['required', 'integer', 'exists:kelas,id'],
        ]);
        $created = $service->promote($data['placements'], (int) $data['tahun_ajaran_tujuan_id']);
        return response()->json(['message' => 'Penempatan tahun ajaran tujuan berhasil dibuat.', 'count' => count($created), 'data' => $created]);
    }

    public function archive(Request $request, StudentPlacementService $service, Siswa $siswa)
    {
        abort_unless($request->user()->can('kelola-master-data'), 403);
        $data = $request->validate([
            'tahun_ajaran_lulus_id' => ['required', 'integer', 'exists:tahun_ajarans,id'],
            'tanggal_lulus' => ['required', 'date'],
            'catatan' => ['nullable', 'string', 'max:5000'],
        ]);
        $archive = $service->archive($siswa->id, (int) $data['tahun_ajaran_lulus_id'], $data['tanggal_lulus'], $data['catatan'] ?? null);
        return response()->json(['message' => 'Siswa berhasil diarsipkan tanpa menghapus riwayat.', 'data' => $archive->load(['siswa:id,nisn,nama', 'tahunAjaranLulus:id,tahun_ajaran'])], 201);
    }

    public function classes(Request $request)
    {
        abort_unless($request->user()->can('kelola-master-data'), 403);
        $data = $request->validate(['tahun_ajaran_id' => ['required', 'integer', 'exists:tahun_ajarans,id']]);
        $classes = Kelas::query()->where('tahun_ajaran_id', $data['tahun_ajaran_id'])->withCount('penempatans')->orderBy('tingkat')->orderBy('nama_kelas')->get();
        return response()->json(['data' => $classes]);
    }

    public function academicYears(Request $request)
    {
        abort_unless($request->user()->can('kelola-master-data'), 403);
        return response()->json(['data' => TahunAjaran::query()->orderByDesc('tahun_ajaran')->get(['id', 'tahun_ajaran', 'is_active'])]);
    }
}
