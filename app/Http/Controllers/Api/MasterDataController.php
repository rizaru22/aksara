<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaSekolah;
use App\Models\JadwalPelajaran;
use App\Models\Kelas;
use App\Models\KalenderJamPelajaran;
use App\Models\MataPelajaran;
use App\Models\PenempatanSiswa;
use App\Models\MateriPelajaran;
use App\Models\Siswa;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Services\ActiveAcademicYearService;
use App\Services\CycleScheduleService;
use App\Services\KalenderJamPelajaranResolver;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

    /**
     * Endpoint GET /api/v1/master-data/teachers.
     * Menyediakan daftar guru dan tenaga pendidik yang bisa dipilih untuk resource master seperti kelas dan jadwal.
     */
    public function teachers(Request $request)
    {
        abort_unless($request->user()->can('kelola-master-data'), 403);

        return response()->json(['data' => User::role(['guru', 'admin', 'kurikulum', 'kepsek'])->orderBy('nama')->get(['id', 'nama', 'nip'])]);
    }

    /**
     * Endpoint GET /api/v1/master-data/{resource}.
     * Mengambil daftar record untuk satu resource master, seperti kelas, siswa, mapel, jadwal, atau agenda sekolah.
     */
    public function index(Request $request, string $resource, KalenderJamPelajaranResolver $calendarResolver, CycleScheduleService $cycles)
    {
        $this->authorizeResource($request, $resource);
        $query = $this->query($resource);
        $this->withRelations($resource, $query);
        $page = $query->latest()->paginate(30);

        if ($resource === 'schedules') {
            $requestedDate = $request->validate(['tanggal' => ['nullable', 'date']])['tanggal'] ?? null;
            $page->getCollection()->transform(fn (JadwalPelajaran $schedule) => $this->appendResolvedScheduleTimes($schedule, $requestedDate, $calendarResolver, $cycles));
        }

        return response()->json($page);
    }

    /**
     * Endpoint GET /api/v1/master-data/{resource}/{id}.
     * Menampilkan satu record master beserta relasi yang dibutuhkan untuk edit atau detail view.
     */
    public function show(Request $request, string $resource, int $id, KalenderJamPelajaranResolver $calendarResolver, CycleScheduleService $cycles)
    {
        $this->authorizeResource($request, $resource);
        $query = $this->query($resource);
        $this->withRelations($resource, $query);
        $model = $query->findOrFail($id);

        if ($resource === 'schedules') {
            $requestedDate = $request->validate(['tanggal' => ['nullable', 'date']])['tanggal'] ?? null;
            $model = $this->appendResolvedScheduleTimes($model, $requestedDate, $calendarResolver, $cycles);
        }

        return response()->json(['data' => $model]);
    }

    /**
     * Endpoint POST /api/v1/master-data/{resource}.
     * Membuat data master baru untuk resource yang dipilih dengan validasi field dan pengecekan konflik jadwal.
     */
    public function store(Request $request, string $resource)
    {
        $this->authorizeResource($request, $resource);
        $modelClass = self::MAP[$resource];
        $input = $resource === 'schedules' ? $this->resolveScheduleInput($request->all()) : $request->all();
        $data = Validator::make($input, $this->rules($resource))->validate();
        $this->validateScheduleConflict($resource, $data);
        $placement = null;
        if ($resource === 'students') {
            $placement = [
                'kelas_id' => (int) ($input['kelas_id'] ?? 0),
                'tahun_ajaran_id' => (int) ($input['tahun_ajaran_id'] ?? 0),
            ];
            Validator::make($placement, [
                'kelas_id' => ['required', 'integer', 'exists:kelas,id'],
                'tahun_ajaran_id' => ['required', 'integer', 'exists:tahun_ajarans,id'],
            ])->validate();
            $class = Kelas::query()->findOrFail($placement['kelas_id']);
            if ((int) $class->tahun_ajaran_id !== $placement['tahun_ajaran_id']) {
                throw ValidationException::withMessages(['kelas_id' => 'Kelas tidak termasuk tahun ajaran yang dipilih.']);
            }
        }

        /** @var Model $model */
        $model = $modelClass::query()->create($data);
        if ($resource === 'students' && $placement) {
            PenempatanSiswa::query()->create([
                'siswa_id' => $model->id,
                'kelas_id' => $placement['kelas_id'],
                'tahun_ajaran_id' => $placement['tahun_ajaran_id'],
            ]);
        }

        return response()->json(['message' => 'Data berhasil dibuat.', 'data' => $model->refresh()], 201);
    }

    /**
     * Endpoint PUT/PATCH /api/v1/master-data/{resource}/{id}.
     * Memperbarui data master yang ada sambil menjaga validasi relasi dan konflik jadwal tetap konsisten.
     */
    public function update(Request $request, string $resource, int $id)
    {
        $this->authorizeResource($request, $resource);
        $model = $this->query($resource)->findOrFail($id);
        $input = array_merge($model->getAttributes(), $request->all());
        if ($resource === 'schedules') $input = $this->resolveScheduleInput($input);
        $data = Validator::make($input, $this->rules($resource, $id, true))->validate();
        $this->validateScheduleConflict($resource, array_merge($model->getAttributes(), $data), $model->id);

        $placement = null;
        if ($resource === 'students' && ($request->exists('kelas_id') || $request->exists('tahun_ajaran_id'))) {
            $placement = Validator::make($request->all(), [
                'kelas_id' => ['required', 'integer', 'exists:kelas,id'],
                'tahun_ajaran_id' => ['required', 'integer', 'exists:tahun_ajarans,id'],
            ])->validate();
            $class = Kelas::query()->findOrFail($placement['kelas_id']);
            if ((int) $class->tahun_ajaran_id !== (int) $placement['tahun_ajaran_id']) {
                throw ValidationException::withMessages(['kelas_id' => 'Kelas tidak termasuk tahun ajaran yang dipilih.']);
            }
            unset($data['kelas_id'], $data['tahun_ajaran_id']);
        }

        DB::transaction(function () use ($model, $data, $resource, $placement): void {
            $model->fill($data)->save();
            if ($resource === 'students' && $placement) {
                PenempatanSiswa::query()->updateOrCreate(
                    ['siswa_id' => $model->id, 'tahun_ajaran_id' => (int) $placement['tahun_ajaran_id']],
                    ['kelas_id' => (int) $placement['kelas_id']]
                );
            }
        });

        return response()->json(['message' => 'Data berhasil diperbarui.', 'data' => $model->refresh()], 200);
    }

    /**
     * Endpoint DELETE /api/v1/master-data/{resource}/{id}.
     * Menghapus data master hanya jika tidak memiliki relasi atau riwayat yang masih digunakan oleh sistem.
     */
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

    /**
     * Endpoint POST /api/v1/master-data/academic-years/{tahunAjaran}/activate.
     * Menyetel tahun ajaran yang dipilih sebagai aktif dan menyinkronkan data referensi terkait.
     */
    public function activateAcademicYear(Request $request, TahunAjaran $tahunAjaran, ActiveAcademicYearService $service)
    {
        abort_unless($request->user()->can('kelola-tahun-ajaran'), 403);
        $active = $service->activate($tahunAjaran->id);

        return response()->json(['message' => 'Tahun ajaran aktif berhasil disinkronkan.', 'data' => $active]);
    }

    /**
     * Resolve submitted period ranges server-side so browser-provided clock values
     * can never override the active calendar as the source of truth.
     */
    private function resolveScheduleInput(array $data): array
    {
        $start = $data['periode_mulai'] ?? null;
        $end = $data['periode_selesai'] ?? null;

        if ($start === null && $end === null) return $data;
        if ($start === null || $end === null || (int) $start < 1 || (int) $end < (int) $start) {
            throw ValidationException::withMessages(['periode_mulai' => 'Periode mulai dan selesai harus diisi dengan rentang yang valid.']);
        }

        $calendar = KalenderJamPelajaran::query()
            ->where('status', KalenderJamPelajaran::STATUS_AKTIF)
            ->with(['detailPeriode' => fn ($query) => $query->where('hari', $data['hari'] ?? '')->orderBy('nomor_periode')])
            ->first();

        if (! $calendar) {
            throw ValidationException::withMessages(['periode_mulai' => 'Tidak ada kalender jam pelajaran aktif. Aktifkan kalender terlebih dahulu.']);
        }

        $periods = $calendar->detailPeriode->keyBy(fn ($period) => (int) $period->nomor_periode);
        $first = $periods->get((int) $start);
        $last = $periods->get((int) $end);
        if (! $first || ! $last) {
            throw ValidationException::withMessages(['periode_mulai' => 'Rentang periode tidak tersedia pada hari yang dipilih di kalender aktif.']);
        }

        for ($number = (int) $start; $number <= (int) $end; $number++) {
            if (! $periods->has($number)) {
                throw ValidationException::withMessages(['periode_selesai' => 'Rentang periode harus berurutan dan tidak boleh melewati periode yang tidak tersedia.']);
            }
        }

        $data['jam_mulai'] = substr((string) $first->jam_mulai, 0, 5);
        $data['jam_selesai'] = substr((string) $last->jam_selesai, 0, 5);
        return $data;
    }

    /**
     * Append date-specific calendar times without overwriting legacy clock columns used by edit forms.
     */
    private function appendResolvedScheduleTimes(
        JadwalPelajaran $schedule,
        ?string $requestedDate,
        KalenderJamPelajaranResolver $calendarResolver,
        CycleScheduleService $cycles
    ): JadwalPelajaran {
        $date = $requestedDate
            ? \Carbon\CarbonImmutable::parse($requestedDate, config('app.timezone'))->startOfDay()
            : \Carbon\CarbonImmutable::today(config('app.timezone'));

        if (! $requestedDate) {
            for ($offset = 0; $offset < 7 && $cycles->getHariIndo($date) !== $schedule->hari; $offset++) {
                $date = $date->addDay();
            }
        }

        if ($cycles->getHariIndo($date) !== $schedule->hari) {
            $schedule->setAttribute('jam_mulai_resolved', null);
            $schedule->setAttribute('jam_selesai_resolved', null);
            $schedule->setAttribute('sumber_waktu_rencana', null);
            $schedule->setAttribute('tanggal_resolusi', $date->toDateString());
            $schedule->setAttribute('kesalahan_resolusi_waktu', 'Tanggal tidak sesuai dengan hari jadwal.');
            return $schedule;
        }

        try {
            $resolved = $calendarResolver->resolve($schedule, $date);
            $schedule->setAttribute('jam_mulai_resolved', $resolved['jam_mulai']->format('H:i:s'));
            $schedule->setAttribute('jam_selesai_resolved', $resolved['jam_selesai']->format('H:i:s'));
            $schedule->setAttribute('sumber_waktu_rencana', $resolved['sumber']);
            $schedule->setAttribute('tanggal_resolusi', $resolved['tanggal']);
            $schedule->setAttribute('kesalahan_resolusi_waktu', null);
        } catch (\RuntimeException $exception) {
            $schedule->setAttribute('jam_mulai_resolved', null);
            $schedule->setAttribute('jam_selesai_resolved', null);
            $schedule->setAttribute('sumber_waktu_rencana', null);
            $schedule->setAttribute('tanggal_resolusi', $date->toDateString());
            $schedule->setAttribute('kesalahan_resolusi_waktu', $exception->getMessage());
        }

        return $schedule;
    }

    /**
     * Memastikan resource master yang diminta valid dan user memiliki permission sesuai jenis datanya.
     */
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

    /**
     * Mengambil query builder untuk resource master tertentu agar operasi CRUD bisa dipakai secara konsisten.
     */
    private function query(string $resource)
    {
        $class = self::MAP[$resource] ?? abort(404);

        return $class::query();
    }

    /**
     * Memuat relasi penting yang dibutuhkan tampilan list atau form edit master data agar UI punya konteks yang lengkap.
     */
    private function withRelations(string $resource, $query): void
    {
        $relations = match ($resource) {
            'classes' => ['waliKelas:id,nama', 'tahunAjaran:id,tahun_ajaran', 'penempatans'],
            'students' => ['penempatans.kelas:id,nama_kelas', 'penempatans.tahunAjaran:id,tahun_ajaran'],
            'materials' => ['mataPelajaran:id,nama_mapel'],
            'schedules' => ['guru:id,nama', 'kelas:id,nama_kelas', 'mataPelajaran:id,nama_mapel', 'tahunAjaran:id,tahun_ajaran'],
            default => [],
        };
        if ($relations) $query->with($relations);
    }

    /**
     * Menyediakan aturan validasi field untuk tiap resource master agar backend dan frontend tetap memiliki satu aturan yang sama.
     */
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
                'tahun_ajaran_id' => $prefix.'required|exists:tahun_ajarans,id',
                'tingkat' => $prefix.'required|string|max:50',
                'jurusan' => $prefix.'required|string|max:100',
                'wali_kelas_id' => $prefix.'nullable|exists:users,id',
            ],
            'students' => [
                'nisn' => $prefix.'required|string|max:255|'.$unique('siswas', 'nisn'),
                'nama' => $prefix.'required|string|max:255',
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
                'periode_mulai' => $prefix.'nullable|integer|min:1',
                'periode_selesai' => $prefix.'nullable|integer|min:1|gte:periode_mulai',
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

    /**
     * Mencegah jadwal baru bertabrakan dengan jadwal guru atau kelas yang sudah ada pada periode sama.
     */
    private function validateScheduleConflict(string $resource, array $data, ?int $ignoreId = null): void
    {
        if ($resource !== 'schedules') return;
        $classMatchesYear = Kelas::query()->whereKey($data['kelas_id'] ?? 0)->where('tahun_ajaran_id', $data['tahun_ajaran_id'] ?? 0)->exists();
        if (! $classMatchesYear) {
            throw ValidationException::withMessages(['kelas_id' => 'Kelas harus berasal dari tahun ajaran yang sama dengan jadwal.']);
        }
        $periodStart = $data['periode_mulai'] ?? null;
        $periodEnd = $data['periode_selesai'] ?? null;
        if (($periodStart === null) !== ($periodEnd === null)) {
            throw ValidationException::withMessages(['periode_mulai' => 'Periode mulai dan selesai harus diisi bersamaan.']);
        }
        if ($periodStart !== null && ((int) $periodStart < 1 || (int) $periodEnd < (int) $periodStart)) {
            throw ValidationException::withMessages(['periode_mulai' => 'Rentang periode jadwal tidak valid.']);
        }
        if ($periodStart === null && $data['jam_mulai'] >= $data['jam_selesai']) {
            throw ValidationException::withMessages(['jam_mulai' => 'Jam mulai harus sebelum jam selesai.']);
        }

        $query = JadwalPelajaran::query()
            ->where('tahun_ajaran_id', $data['tahun_ajaran_id'])
            ->where('semester', $data['semester'])
            ->where('hari', $data['hari']);
        $cycle = $data['siklus_minggu'] ?? null;
        if ($cycle !== null) {
            $query->where(fn ($q) => $q->whereNull('siklus_minggu')->orWhere('siklus_minggu', $cycle));
        }
        if ($ignoreId) $query->where('id', '<>', $ignoreId);
        $query->where(fn ($q) => $q->where('user_id', $data['user_id'])->orWhere('kelas_id', $data['kelas_id']));

        $conflict = $query->get()->contains(function (JadwalPelajaran $existing) use ($data, $periodStart, $periodEnd): bool {
            $existingPeriodStart = $existing->periode_mulai !== null ? (int) $existing->periode_mulai : null;
            $existingPeriodEnd = $existing->periode_selesai !== null ? (int) $existing->periode_selesai : null;

            if ($periodStart !== null && $periodEnd !== null && $existingPeriodStart !== null && $existingPeriodEnd !== null) {
                return (int) $periodStart <= $existingPeriodEnd && (int) $periodEnd >= $existingPeriodStart;
            }

            // Resolve mixed legacy/period schedules to the same school day so a
            // stale clock value cannot hide or invent a conflict.
            $date = CarbonImmutable::today(config('app.timezone'));
            $cycleSchedules = app(CycleScheduleService::class);
            for ($offset = 0; $offset < 7 && $cycleSchedules->getHariIndo($date) !== $data['hari']; $offset++) {
                $date = $date->addDay();
            }

            try {
                $candidate = new JadwalPelajaran($data);
                $resolver = app(KalenderJamPelajaranResolver::class);
                $candidateTime = $resolver->resolve($candidate, $date);
                $existingTime = $resolver->resolve($existing, $date);
            } catch (\RuntimeException $exception) {
                throw ValidationException::withMessages([
                    'schedule' => 'Konflik jadwal tidak dapat divalidasi: '.$exception->getMessage(),
                ]);
            }

            return $candidateTime['jam_mulai'] < $existingTime['jam_selesai']
                && $candidateTime['jam_selesai'] > $existingTime['jam_mulai'];
        });

        if ($conflict) {
            throw ValidationException::withMessages(['schedule' => 'Jadwal bertabrakan dengan jadwal guru atau kelas yang sudah ada.']);
        }
    }

    /**
     * Mengecek apakah data master masih dipakai oleh relasi lain sebelum dihapus untuk menghindari data rusak atau kehilangan referensi.
     */
    private function hasDependents(string $resource, Model $model): bool
    {
        return match ($resource) {
            'academic-years' => $model->jadwalPelajarans()->exists(),
            'classes' => $model->penempatans()->exists() || $model->jadwalPelajarans()->exists(),
            'subjects' => $model->materiPelajarans()->exists() || $model->jadwalPelajarans()->exists(),
            'materials' => $model->jurnalMengajars()->exists(),
            'schedules' => $model->jurnalMengajars()->exists(),
            'students' => $model->presensiSiswas()->exists(),
            default => false,
        };
    }
}
