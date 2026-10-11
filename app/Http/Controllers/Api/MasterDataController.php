<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaSekolah;
use App\Models\JadwalPelajaran;
use App\Models\Kelas;
use App\Models\MataPelajaran;
use App\Models\MateriPelajaran;
use App\Models\Siswa;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Services\ActiveAcademicYearService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class MasterDataController extends Controller
{
    private const MAP = [
        'academic-years' => TahunAjaran::class,
        'classes' => Kelas::class,
        'students' => Siswa::class,
        'subjects' => MataPelajaran::class,
        'materials' => MateriPelajaran::class,
        'schedules' => JadwalPelajaran::class,
        'agendas' => AgendaSekolah::class,
    ];

    public function teachers(Request $request)
    {
        abort_unless($request->user()->can('kelola-master-data'), 403);

        return response()->json(['data' => User::role('guru')->orderBy('nama')->get(['id', 'nama', 'nip'])]);
    }

    public function index(Request $request, string $resource)
    {
        $this->authorizeResource($request, $resource);
        $query = $this->query($resource);
        $this->withRelations($resource, $query);

        return response()->json($query->latest()->paginate(30));
    }

    public function show(Request $request, string $resource, int $id)
    {
        $this->authorizeResource($request, $resource);
        $query = $this->query($resource);
        $this->withRelations($resource, $query);

        return response()->json(['data' => $query->findOrFail($id)]);
    }

    public function store(Request $request, string $resource)
    {
        $this->authorizeResource($request, $resource);
        $modelClass = self::MAP[$resource];
        $data = Validator::make($request->all(), $this->rules($resource))->validate();
        $this->validateScheduleConflict($resource, $data);

        /** @var Model $model */
        $model = $modelClass::query()->create($data);

        return response()->json(['message' => 'Data berhasil dibuat.', 'data' => $model->refresh()], 201);
    }

    public function update(Request $request, string $resource, int $id)
    {
        $this->authorizeResource($request, $resource);
        $model = $this->query($resource)->findOrFail($id);
        $data = Validator::make($request->all(), $this->rules($resource, $id, true))->validate();
        $this->validateScheduleConflict($resource, array_merge($model->getAttributes(), $data), $model->id);
        $model->fill($data)->save();

        return response()->json(['message' => 'Data berhasil diperbarui.', 'data' => $model->refresh()], 200);
    }

    public function destroy(Request $request, string $resource, int $id)
    {
        $this->authorizeResource($request, $resource);
        $model = $this->query($resource)->findOrFail($id);
        if ($this->hasDependents($resource, $model)) {
            throw ValidationException::withMessages(['resource' => 'Data masih memiliki relasi atau riwayat dan tidak dapat dihapus.']);
        }
        $model->delete();

        return response()->json(['message' => 'Data berhasil dihapus.']);
    }

    public function activateAcademicYear(Request $request, TahunAjaran $tahunAjaran, ActiveAcademicYearService $service)
    {
        abort_unless($request->user()->can('kelola-tahun-ajaran'), 403);
        $active = $service->activate($tahunAjaran->id);

        return response()->json(['message' => 'Tahun ajaran aktif berhasil disinkronkan.', 'data' => $active]);
    }

    private function authorizeResource(Request $request, string $resource): void
    {
        abort_unless(isset(self::MAP[$resource]), 404);
        $permission = match ($resource) {
            'academic-years' => 'kelola-tahun-ajaran',
            'agendas' => 'kelola-agenda-sekolah',
            default => 'kelola-master-data',
        };
        abort_unless($request->user()->can($permission), 403);
    }

    private function query(string $resource)
    {
        $class = self::MAP[$resource] ?? abort(404);

        return $class::query();
    }

    private function withRelations(string $resource, $query): void
    {
        $relations = match ($resource) {
            'classes' => ['waliKelas:id,nama', 'siswas'],
            'students' => ['kelas:id,nama_kelas'],
            'materials' => ['mataPelajaran:id,nama_mapel'],
            'schedules' => ['guru:id,nama', 'kelas:id,nama_kelas', 'mataPelajaran:id,nama_mapel', 'tahunAjaran:id,tahun_ajaran'],
            default => [],
        };
        if ($relations) $query->with($relations);
    }

    private function rules(string $resource, ?int $id = null, bool $sometimes = false): array
    {
        $prefix = $sometimes ? 'sometimes|' : '';
        $unique = fn (string $table, string $column) => "unique:{$table},{$column}".($id ? ",{$id}" : '');

        return match ($resource) {
            'academic-years' => [
                'tahun_ajaran' => $prefix.'required|string|max:9|'.$unique('tahun_ajarans', 'tahun_ajaran'),
            ],
            'classes' => [
                'nama_kelas' => $prefix.'required|string|max:255',
                'tingkat' => $prefix.'required|string|max:50',
                'jurusan' => $prefix.'required|string|max:100',
                'wali_kelas_id' => $prefix.'nullable|exists:users,id',
            ],
            'students' => [
                'nisn' => $prefix.'required|string|max:255|'.$unique('siswas', 'nisn'),
                'nama' => $prefix.'required|string|max:255',
                'kelas_id' => $prefix.'required|exists:kelas,id',
                'jenis_kelamin' => $prefix.'required|in:L,P',
            ],
            'subjects' => [
                'kode_mapel' => $prefix.'required|string|max:255|'.$unique('mata_pelajarans', 'kode_mapel'),
                'nama_mapel' => $prefix.'required|string|max:255',
            ],
            'materials' => [
                'mata_pelajaran_id' => $prefix.'required|exists:mata_pelajarans,id',
                'urutan_bab' => $prefix.'required|integer|min:1',
                'judul_bab' => $prefix.'required|string|max:255',
                'target_jjp' => $prefix.'required|integer|min:1',
            ],
            'schedules' => [
                'tahun_ajaran_id' => $prefix.'required|exists:tahun_ajarans,id',
                'semester' => $prefix.'required|in:Ganjil,Genap',
                'user_id' => $prefix.'required|exists:users,id',
                'kelas_id' => $prefix.'required|exists:kelas,id',
                'mata_pelajaran_id' => $prefix.'required|exists:mata_pelajarans,id',
                'siklus_minggu' => $prefix.'nullable|integer|in:1,2,3',
                'hari' => $prefix.'required|in:Senin,Selasa,Rabu,Kamis,Jumat,Sabtu',
                'jam_mulai' => $prefix.'required|date_format:H:i',
                'jam_selesai' => $prefix.'required|date_format:H:i|after:jam_mulai',
            ],
            'agendas' => [
                'nama_agenda' => $prefix.'required|string|max:255',
                'tanggal' => $prefix.'required|date',
                'jam_mulai' => $prefix.'required|date_format:H:i',
                'jam_selesai' => $prefix.'required|date_format:H:i|after:jam_mulai',
                'scope' => $prefix.'required|in:SEKOLAH',
                'override_kbm' => $prefix.'required|boolean',
                'lat_temporary' => $prefix.'nullable|numeric|between:-90,90',
                'long_temporary' => $prefix.'nullable|numeric|between:-180,180',
                'radius_meters' => $prefix.'nullable|integer|min:1',
            ],
            default => throw ValidationException::withMessages(['resource' => 'Jenis data tidak dikenal.']),
        };
    }

    private function validateScheduleConflict(string $resource, array $data, ?int $ignoreId = null): void
    {
        if ($resource !== 'schedules') return;
        if ($data['jam_mulai'] >= $data['jam_selesai']) {
            throw ValidationException::withMessages(['jam_mulai' => 'Jam mulai harus sebelum jam selesai.']);
        }

        $query = JadwalPelajaran::query()
            ->where('tahun_ajaran_id', $data['tahun_ajaran_id'])
            ->where('semester', $data['semester'])
            ->where('hari', $data['hari'])
            ->where('jam_mulai', '<', $data['jam_selesai'])
            ->where('jam_selesai', '>', $data['jam_mulai']);
        $cycle = $data['siklus_minggu'] ?? null;
        if ($cycle !== null) {
            $query->where(fn ($q) => $q->whereNull('siklus_minggu')->orWhere('siklus_minggu', $cycle));
        }
        if ($ignoreId) $query->where('id', '<>', $ignoreId);
        $query->where(fn ($q) => $q->where('user_id', $data['user_id'])->orWhere('kelas_id', $data['kelas_id']));

        if ($query->exists()) {
            throw ValidationException::withMessages(['schedule' => 'Jadwal bertabrakan dengan jadwal guru atau kelas yang sudah ada.']);
        }
    }

    private function hasDependents(string $resource, Model $model): bool
    {
        return match ($resource) {
            'academic-years' => $model->jadwalPelajarans()->exists(),
            'classes' => $model->siswas()->exists() || $model->jadwalPelajarans()->exists(),
            'subjects' => $model->materiPelajarans()->exists() || $model->jadwalPelajarans()->exists(),
            'materials' => $model->jurnalMengajars()->exists(),
            'schedules' => $model->jurnalMengajars()->exists(),
            'students' => $model->presensiSiswas()->exists(),
            default => false,
        };
    }
}
