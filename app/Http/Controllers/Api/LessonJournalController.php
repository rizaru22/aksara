<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaSekolah;
use App\Models\JadwalPelajaran;
use App\Models\JurnalMengajar;
use App\Models\PengajuanGuruPengganti;
use App\Models\PresensiSiswa;
use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Services\CycleScheduleService;
use App\Services\HaversineService;
use App\Services\KalenderJamPelajaranResolver;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class LessonJournalController extends Controller
{
    private const DEFAULT_GPS_ACCURACY_METERS = 40;

    private function maxGpsAccuracyMeters(): int
    {
        $configured = Setting::value('journal_gps_accuracy_meters');
        if ($configured !== null && $configured !== '') {
            return max(1, min(100, (int) $configured));
        }

        return max(1, min(100, (int) config('aksara.gps_accuracy.journal_meters', config('aksara.gps_accuracy.attendance_meters', self::DEFAULT_GPS_ACCURACY_METERS))));
    }

    /**
     * Endpoint GET /api/v1/teacher/schedules/{jadwalPelajaran}/students.
     * Mengambil daftar siswa satu kelas untuk dimunculkan di modal jurnal.
     * Endpoint ini juga memastikan jadwal yang dibuka benar-benar milik guru saat ini dan aktif di siklus yang berlaku.
     */
    public function students(Request $request, JadwalPelajaran $jadwalPelajaran, CycleScheduleService $cycles, KalenderJamPelajaranResolver $calendarResolver)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);
        $now = now(config('app.timezone'));
        $this->authorizeSchedule($request, $jadwalPelajaran, $now, $cycles, $calendarResolver);

        $draft = JurnalMengajar::query()->with('presensiSiswas')
            ->where('jadwal_pelajaran_id', $jadwalPelajaran->id)
            ->whereDate('tanggal', $now->toDateString())
            ->where(fn ($query) => $query->where('user_id', $request->user()->id)->orWhere('guru_pengganti_id', $request->user()->id))
            ->where('status_sesi', JurnalMengajar::STATUS_DRAFT)
            ->first();

        return response()->json([
            'data' => DB::table('siswas')->where('kelas_id', $jadwalPelajaran->kelas_id)->orderBy('nama')->get(['id', 'nisn', 'nama']),
            'draft' => $draft,
        ]);
    }

    /**
     * Endpoint POST /api/v1/lesson-journals.
     * Menyimpan atau memperbarui draft jurnal yang masih berlangsung.
     * Flow ini memastikan seluruh siswa kelas masuk dalam presensi dan data tidak dibuat secara parsial.
     */
    public function store(Request $request, CycleScheduleService $cycles, KalenderJamPelajaranResolver $calendarResolver)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);
        $data = $request->validate([
            'jadwal_pelajaran_id' => ['required', 'integer', 'exists:jadwal_pelajarans,id'],
            'materi_pelajaran_id' => ['nullable', 'integer', 'exists:materi_pelajarans,id'],
            'materi_pembahasan' => ['required', 'string', 'min:3', 'max:10000'],
            'catatan_kejadian_kelas' => ['nullable', 'string', 'max:10000'],
            'presensi' => ['required', 'array', 'min:1'],
            'presensi.*.siswa_id' => ['required', 'integer', 'distinct', 'exists:siswas,id'],
            'presensi.*.status' => ['required', 'in:HADIR,SAKIT,IZIN,ALPHA,CABUT'],
            'presensi.*.keterangan' => ['nullable', 'string', 'max:255'],
        ]);

        $now = now(config('app.timezone'));
        $schedule = JadwalPelajaran::query()->with('kelas')->findOrFail($data['jadwal_pelajaran_id']);
        $this->authorizeSchedule($request, $schedule, $now, $cycles, $calendarResolver);
        $activeSubstitute = $this->activeSubstituteForSchedule($schedule, $now);
        $existingDraft = JurnalMengajar::query()
            ->where('jadwal_pelajaran_id', $schedule->id)
            ->whereDate('tanggal', $now->toDateString())
            ->where('status_sesi', JurnalMengajar::STATUS_DRAFT)
            ->first();
        if ($existingDraft && $now->greaterThan($existingDraft->created_at->copy()->addHours(48))) {
            $existingDraft->update(['status_sesi' => JurnalMengajar::STATUS_KEDALUWARSA]);
            throw new ConflictHttpException('Batas perubahan dan finalisasi 48 jam telah lewat. Jurnal sudah kedaluwarsa.');
        }
        if ($request->hasFile('foto_kegiatan')) {
            throw ValidationException::withMessages(['foto_kegiatan' => 'Foto diambil saat finalisasi jurnal pada 30 menit terakhir pelajaran.']);
        }
        if ($data['materi_pelajaran_id'] ?? null) {
            $belongsToSubject = DB::table('materi_pelajarans')
                ->where('id', $data['materi_pelajaran_id'])
                ->where('mata_pelajaran_id', $schedule->mata_pelajaran_id)
                ->exists();
            if (! $belongsToSubject) {
                throw ValidationException::withMessages(['materi_pelajaran_id' => 'Materi harus berasal dari mata pelajaran pada jadwal ini.']);
            }
        }

        $expectedStudents = DB::table('siswas')->where('kelas_id', $schedule->kelas_id)->pluck('id')->map(fn ($id) => (int) $id)->sort()->values();
        $submittedStudents = collect($data['presensi'])->pluck('siswa_id')->map(fn ($id) => (int) $id)->sort()->values();
        if ($expectedStudents->isEmpty() || $expectedStudents->all() !== $submittedStudents->all()) {
            throw ValidationException::withMessages(['presensi' => 'Daftar presensi harus mencakup seluruh siswa kelas dan tidak boleh memuat siswa dari kelas lain.']);
        }

        [$journal, $created] = DB::transaction(function () use ($request, $data, $schedule, $now, $activeSubstitute, $calendarResolver): array {
            $lockedSchedule = JadwalPelajaran::query()->lockForUpdate()->findOrFail($schedule->id);
            $journal = JurnalMengajar::query()
                ->where('jadwal_pelajaran_id', $lockedSchedule->id)
                ->whereDate('tanggal', $now->toDateString())
                ->lockForUpdate()
                ->first();
            if ($journal && $journal->status_sesi !== JurnalMengajar::STATUS_DRAFT) {
                throw new ConflictHttpException('Jurnal sesi ini sudah selesai dan tidak dapat diubah.');
            }
            $created = ! $journal;
            $resolved = null;

            if ($created) {
                try {
                    // Resolve inside the transaction so the snapshot matches the calendar
                    // state observed when the new draft is committed.
                    $resolved = $calendarResolver->resolve($lockedSchedule, $now);
                } catch (\RuntimeException $exception) {
                    throw new ConflictHttpException($exception->getMessage(), $exception);
                }

                if (AgendaSekolah::query()
                    ->whereDate('tanggal', $now->toDateString())
                    ->where('scope', 'SEKOLAH')
                    ->where('override_kbm', true)
                    ->where('jam_mulai', '<', $resolved['jam_selesai']->format('H:i:s'))
                    ->where('jam_selesai', '>', $resolved['jam_mulai']->format('H:i:s'))
                    ->exists()) {
                    throw new ConflictHttpException('KBM pada waktu sesi ini ditangguhkan oleh agenda sekolah.');
                }
            }

            $journal ??= new JurnalMengajar;
            $journal->fill([
                'user_id' => $lockedSchedule->user_id,
                'guru_pengganti_id' => $activeSubstitute?->guru_pengganti_id,
                'jadwal_pelajaran_id' => $lockedSchedule->id,
                'materi_pelajaran_id' => $data['materi_pelajaran_id'] ?? null,
                'tanggal' => $now->toDateString(),
                'materi_pembahasan' => $data['materi_pembahasan'],
                'catatan_kejadian_kelas' => $data['catatan_kejadian_kelas'] ?? null,
                'jam_mulai_realisasi' => $journal->jam_mulai_realisasi ?? $now,
                'jam_selesai_realisasi' => null,
                'status_sesi' => JurnalMengajar::STATUS_DRAFT,
            ]);

            // Snapshot is written only once, when the first draft is created.
            // Updating an existing draft must never replace its original calendar context.
            if ($created && $resolved !== null) {
                $journal->fill([
                    'kalender_id_snapshot' => $resolved['kalender_id'],
                    'waktu_rencana_mulai' => $resolved['jam_mulai'],
                    'waktu_rencana_selesai' => $resolved['jam_selesai'],
                    'periode_mulai_snapshot' => $resolved['periode_mulai'],
                    'periode_selesai_snapshot' => $resolved['periode_selesai'],
                ]);
            }

            $journal->save();

            $studentIds = collect($data['presensi'])->pluck('siswa_id')->map(fn ($id) => (int) $id)->all();
            $journal->presensiSiswas()->whereNotIn('siswa_id', $studentIds)->delete();
            foreach ($data['presensi'] as $attendance) {
                $journal->presensiSiswas()->updateOrCreate(
                    ['siswa_id' => $attendance['siswa_id']],
                    ['status' => $attendance['status'], 'keterangan' => $attendance['keterangan'] ?? null],
                );
            }

            return [$journal->load(['jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran', 'presensiSiswas.siswa']), $created];
        });

        return response()->json([
            'message' => $created ? 'Draf jurnal dan presensi siswa tersimpan.' : 'Draf jurnal dan presensi siswa diperbarui.',
            'data' => $journal,
        ], $created ? 201 : 200);
    }

    /**
     * Endpoint GET /api/v1/lesson-journals.
     * Menampilkan seluruh jurnal milik guru, termasuk draft lama dan final yang sudah diselesaikan,
     * sehingga guru dapat melanjutkan jurnal berdasarkan tanggal pembelajaran asli, bukan tanggal saat mengisi.
     */
    public function index(Request $request)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);

        $validated = $request->validate([
            'status' => ['nullable', 'in:all,draft,final,finalisasi_susulan,kedaluwarsa'],
            'tanggal' => ['nullable', 'date'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_selesai' => ['nullable', 'date'],
            'kelas_id' => ['nullable', 'integer', 'exists:kelas,id'],
            'mata_pelajaran_id' => ['nullable', 'integer', 'exists:mata_pelajarans,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = JurnalMengajar::query()
            ->with(['jadwalPelajaran.kelas:id,nama_kelas,tingkat,jurusan', 'jadwalPelajaran.mataPelajaran:id,nama_mapel'])
            ->withCount('presensiSiswas')
            ->where(fn ($journalQuery) => $journalQuery
                ->where('user_id', $request->user()->id)
                ->orWhere('guru_pengganti_id', $request->user()->id)
            )
            ->orderByDesc('tanggal')
            ->orderByDesc('updated_at');

        $status = $validated['status'] ?? 'all';
        if ($status !== 'all') {
            $normalizedStatus = match ($status) {
                'draft' => JurnalMengajar::STATUS_DRAFT,
                'final' => JurnalMengajar::STATUS_FINAL,
                'finalisasi_susulan' => JurnalMengajar::STATUS_FINALISASI_SUSULAN,
                'kedaluwarsa' => JurnalMengajar::STATUS_KEDALUWARSA,
                default => null,
            };

            if ($normalizedStatus !== null) {
                $query->where('status_sesi', $normalizedStatus);
            }
        }

        if (! empty($validated['tanggal'])) {
            $query->whereDate('tanggal', $validated['tanggal']);
        }

        if (! empty($validated['tanggal_mulai'])) {
            $query->whereDate('tanggal', '>=', $validated['tanggal_mulai']);
        }

        if (! empty($validated['tanggal_selesai'])) {
            $query->whereDate('tanggal', '<=', $validated['tanggal_selesai']);
        }

        if (! empty($validated['kelas_id'])) {
            $query->whereHas('jadwalPelajaran', fn ($scheduleQuery) => $scheduleQuery->where('kelas_id', $validated['kelas_id']));
        }

        if (! empty($validated['mata_pelajaran_id'])) {
            $query->where(function ($subjectQuery) use ($validated): void {
                $subjectQuery->where('materi_pelajaran_id', $validated['mata_pelajaran_id'])
                    ->orWhereHas('jadwalPelajaran', fn ($scheduleQuery) => $scheduleQuery->where('mata_pelajaran_id', $validated['mata_pelajaran_id']));
            });
        }

        if (! empty($validated['search'])) {
            $search = trim($validated['search']);
            $query->where(function ($searchQuery) use ($search): void {
                $searchQuery->where('materi_pembahasan', 'like', "%{$search}%")
                    ->orWhereHas('jadwalPelajaran.kelas', fn ($kelasQuery) => $kelasQuery->where('nama_kelas', 'like', "%{$search}%"))
                    ->orWhereHas('jadwalPelajaran.mataPelajaran', fn ($subjectQuery) => $subjectQuery->where('nama_mapel', 'like', "%{$search}%"));
            });
        }

        $perPage = $validated['per_page'] ?? 20;
        $journals = $query->paginate($perPage);

        $data = $journals->getCollection()->map(function (JurnalMengajar $journal): array {
            $kelas = $journal->jadwalPelajaran?->kelas;
            $mataPelajaran = $journal->jadwalPelajaran?->mataPelajaran;
            $totalSiswa = $kelas ? DB::table('siswas')->where('kelas_id', $kelas->id)->count() : 0;
            $presensiCount = (int) ($journal->presensi_siswas_count ?? $journal->presensiSiswas->count());
            $lengkap = $totalSiswa > 0 && $presensiCount === $totalSiswa;

            return [
                'id' => $journal->id,
                'tanggal' => $journal->tanggal instanceof \Carbon\Carbon ? $journal->tanggal->toDateString() : (string) $journal->tanggal,
                'status_sesi' => $journal->status_sesi,
                'status_label' => match ($journal->status_sesi) { JurnalMengajar::STATUS_DRAFT => 'Draft', JurnalMengajar::STATUS_FINAL => 'Final', JurnalMengajar::STATUS_FINALISASI_SUSULAN => 'Finalisasi Susulan', JurnalMengajar::STATUS_KEDALUWARSA => 'Kedaluwarsa', default => ucfirst($journal->status_sesi) },
                'materi_pembahasan' => $journal->materi_pembahasan,
                'catatan_kejadian_kelas' => $journal->catatan_kejadian_kelas,
                'kelas' => $kelas ? ['id' => $kelas->id, 'nama_kelas' => $kelas->nama_kelas] : null,
                'mata_pelajaran' => $mataPelajaran ? ['id' => $mataPelajaran->id, 'nama_mapel' => $mataPelajaran->nama_mapel] : null,
                'presensi_count' => $presensiCount,
                'total_siswa' => $totalSiswa,
                'lengkap' => $lengkap,
                'foto_kegiatan' => $journal->foto_kegiatan,
                'jam_mulai_realisasi' => $journal->jam_mulai_realisasi,
                'jam_selesai_realisasi' => $journal->jam_selesai_realisasi,
                'updated_at' => $journal->updated_at?->toIso8601String(),
                'created_at' => $journal->created_at?->toIso8601String(),
            ];
        })->all();

        $journals->setCollection(collect($data));

        return response()->json([
            'data' => $data,
            'meta' => [
                'total' => $journals->total(),
                'per_page' => $journals->perPage(),
                'current_page' => $journals->currentPage(),
                'last_page' => $journals->lastPage(),
                'status' => $status,
            ],
        ]);
    }

    /**
     * Endpoint GET /api/v1/lesson-journals/{jurnalMengajar}.
     * Menampilkan draf jurnal yang sudah tersimpan agar UI dapat melanjutkan pengisian tanpa mengulang input.
     */
    public function show(Request $request, JurnalMengajar $jurnalMengajar)
    {
        $user = $request->user();
        $canManage = $user->hasRole('admin') || $user->can('view-dashboard-kurikulum');
        abort_unless($jurnalMengajar->user_id === $user->id || $jurnalMengajar->guru_pengganti_id === $user->id || $canManage, 403);

        return response()->json(['data' => $jurnalMengajar->load(['jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran', 'presensiSiswas.siswa'])]);
    }

    /**
     * Endpoint POST /api/v1/lesson-journals/{jurnalMengajar}/finalize.
     * Proses finalisasi bertahap: validasi foto + GPS + geofence + waktu + kelengkapan daftar presensi.
     * Jika kondisi darurat, sistem memperbolehkan finalisasi lewat mode emergency dengan catatan penutupan.
     */
    public function finalize(Request $request, JurnalMengajar $jurnalMengajar, CycleScheduleService $cycles, HaversineService $distance, KalenderJamPelajaranResolver $calendarResolver)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);
        abort_unless(
            $jurnalMengajar->user_id === $request->user()->id || $jurnalMengajar->guru_pengganti_id === $request->user()->id,
            403,
            'Anda hanya dapat memfinalisasi jurnal yang relevan dengan jadwal Anda.'
        );

        $isLateFinalization = $request->boolean('finalisasi_susulan');
        $rules = [
            'finalisasi_susulan' => ['nullable', 'boolean'],
            'catatan_penutupan' => ['nullable', 'string', 'max:2000'],
        ];
        if (! $isLateFinalization) {
            $rules += [
                'foto_kegiatan' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
                'latitude' => ['required', 'numeric', 'between:-90,90'],
                'longitude' => ['required', 'numeric', 'between:-180,180'],
                'accuracy' => ['required', 'numeric', 'min:0', 'max:'.$this->maxGpsAccuracyMeters()],
                'darurat' => ['nullable', 'boolean'],
            ];
        }
        $data = $request->validate($rules);

        if ($jurnalMengajar->status_sesi !== JurnalMengajar::STATUS_DRAFT) {
            throw new ConflictHttpException('Hanya jurnal berstatus Draft yang dapat difinalisasi.');
        }

        $now = now(config('app.timezone'));
        $deadline = $jurnalMengajar->created_at->copy()->addHours(48);
        if ($now->greaterThan($deadline)) {
            DB::table('jurnal_mengajars')
                ->where('id', $jurnalMengajar->id)
                ->where('status_sesi', JurnalMengajar::STATUS_DRAFT)
                ->update(['status_sesi' => JurnalMengajar::STATUS_KEDALUWARSA, 'updated_at' => $now]);

            throw new ConflictHttpException('Batas finalisasi 48 jam telah lewat. Jurnal sudah kedaluwarsa.');
        }

        $schedule = $jurnalMengajar->jadwalPelajaran()->firstOrFail();
        if ($isLateFinalization) {
            $sessionDate = $jurnalMengajar->tanggal instanceof \Carbon\Carbon
                ? $jurnalMengajar->tanggal->toDateString()
                : (string) $jurnalMengajar->tanggal;
            $sessionEnd = Carbon::parse($sessionDate.' '.$schedule->jam_selesai, config('app.timezone'));
            if ($now->lessThanOrEqualTo($sessionEnd)) {
                throw new ConflictHttpException('Finalisasi susulan hanya tersedia setelah waktu pembelajaran berakhir.');
            }
        }
        if (! $isLateFinalization) {
            $this->authorizeSchedule($request, $schedule, $now, $cycles);
        }

        $expectedIds = DB::table('siswas')->where('kelas_id', $schedule->kelas_id)->pluck('id')->map(fn ($id) => (int) $id)->sort()->values();
        $draftIds = $jurnalMengajar->presensiSiswas()->pluck('siswa_id')->map(fn ($id) => (int) $id)->sort()->values();
        if ($expectedIds->isEmpty() || $expectedIds->all() !== $draftIds->all()) {
            throw ValidationException::withMessages(['presensi' => 'Perbarui draf agar mencakup seluruh siswa kelas sebelum finalisasi.']);
        }

        $photoPath = null;
        $distanceMeters = null;
        if (! $isLateFinalization) {
            $isEmergency = filter_var($data['darurat'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $distanceMeters = $this->verifyFinalizationLocation($data, $distance);
            $this->authorizeFinalizationWindow($schedule, $now, $isEmergency);
            $photoPath = $data['foto_kegiatan']->store('lesson-journals', 'local');
        }

        try {
            $journal = DB::transaction(function () use ($jurnalMengajar, $data, $now, $distanceMeters, $photoPath, $isLateFinalization): JurnalMengajar {
                $journal = JurnalMengajar::query()->lockForUpdate()->findOrFail($jurnalMengajar->id);
                if ($journal->status_sesi !== JurnalMengajar::STATUS_DRAFT) {
                    throw new ConflictHttpException('Jurnal sudah difinalisasi atau tidak lagi berstatus Draft.');
                }
                if ($now->greaterThan($journal->created_at->copy()->addHours(48))) {
                    $journal->status_sesi = JurnalMengajar::STATUS_KEDALUWARSA;
                    $journal->save();
                    throw new ConflictHttpException('Batas finalisasi 48 jam telah lewat. Jurnal sudah kedaluwarsa.');
                }

                if (! $isLateFinalization) {
                    $journal->fill([
                        'foto_kegiatan' => $photoPath,
                        'lat_finalisasi' => $data['latitude'],
                        'long_finalisasi' => $data['longitude'],
                        'gps_accuracy_finalisasi' => $data['accuracy'],
                        'jarak_geofence_finalisasi' => $distanceMeters,
                    ]);
                }
                $journal->fill([
                    'jam_selesai_realisasi' => $now,
                    'status_sesi' => $isLateFinalization
                        ? JurnalMengajar::STATUS_FINALISASI_SUSULAN
                        : JurnalMengajar::STATUS_FINAL,
                    'catatan_penutupan' => $data['catatan_penutupan'] ?? null,
                ])->save();

                return $journal->load(['jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran', 'presensiSiswas.siswa']);
            });
        } catch (\Throwable $exception) {
            if ($photoPath) {
                Storage::disk('local')->delete($photoPath);
            }
            // Persist expiry if the deadline passed while the transaction was running.
            if (now(config('app.timezone'))->greaterThan($deadline)) {
                DB::table('jurnal_mengajars')
                    ->where('id', $jurnalMengajar->id)
                    ->where('status_sesi', JurnalMengajar::STATUS_DRAFT)
                    ->update([
                        'status_sesi' => JurnalMengajar::STATUS_KEDALUWARSA,
                        'updated_at' => now(config('app.timezone')),
                    ]);
            }
            throw $exception;
        }

        $message = $isLateFinalization
            ? 'Jurnal berhasil difinalisasi sebagai Finalisasi Susulan.'
            : ((($data['darurat'] ?? false) && filter_var($data['darurat'], FILTER_VALIDATE_BOOLEAN))
                ? 'Jurnal dan presensi siswa berhasil difinalisasi dengan catatan darurat.'
                : 'Jurnal dan presensi siswa berhasil difinalisasi.');

        return response()->json(['message' => $message, 'data' => $journal]);
    }

    /**
     * Endpoint PATCH /api/v1/student-attendances/{presensiSiswa}.
     * Memperbarui status presensi siswa pada draf jurnal yang sedang dibuka oleh guru atau wali kelas yang berwenang.
     */
    public function updateStudentAttendance(Request $request, PresensiSiswa $presensiSiswa)
    {
        $user = $request->user();
        abort_unless($user->can('kelola-presensi-siswa'), 403);
        $journal = $presensiSiswa->jurnalMengajar()->with('jadwalPelajaran')->firstOrFail();
        $class = $journal->jadwalPelajaran->kelas_id;
        $isAdmin = $user->hasRole('admin');
        $isWali = DB::table('kelas')->where('id', $class)->where('wali_kelas_id', $user->id)->exists();
        abort_unless($isAdmin || $isWali, 403, 'Koreksi hanya dapat dilakukan Admin atau wali kelas terkait.');

        if ($journal->status_sesi !== JurnalMengajar::STATUS_DRAFT) {
            throw new ConflictHttpException('Presensi hanya dapat dikoreksi selama jurnal masih berstatus Draft.');
        }

        $data = $request->validate([
            'status' => ['required', 'in:HADIR,SAKIT,IZIN,ALPHA,CABUT'],
            'keterangan' => ['nullable', 'string', 'max:255'],
        ]);
        $presensiSiswa->fill($data)->save();

        return response()->json(['message' => 'Koreksi presensi sesi tersimpan.', 'data' => $presensiSiswa->refresh()]);
    }

    /**
     * Endpoint GET /api/v1/student-attendances/wali-sessions.
     * Menyediakan sesi jurnal yang relevan untuk wali kelas agar mereka dapat meninjau atau mengoreksi presensi siswa.
     */
    public function waliSessions(Request $request)
    {
        $user = $request->user();
        abort_unless($user->can('kelola-presensi-siswa'), 403);
        $query = JurnalMengajar::query()->with(['jadwalPelajaran.kelas', 'presensiSiswas.siswa'])->latest('tanggal');
        if (! $user->hasRole('admin')) {
            $classIds = DB::table('kelas')->where('wali_kelas_id', $user->id)->pluck('id');
            abort_unless($classIds->isNotEmpty(), 403, 'Akses koreksi hanya diberikan kepada wali kelas.');
            $query->whereHas('jadwalPelajaran', fn ($schedule) => $schedule->whereIn('kelas_id', $classIds));
        }

        return response()->json($query->paginate(25));
    }

    /**
     * Mengambalikan pengajuan pengganti yang aktif untuk sesi hari ini, bila ada persetujuan admin.
     */
    private function activeSubstituteForSchedule(JadwalPelajaran $schedule, Carbon $now): ?PengajuanGuruPengganti
    {
        return PengajuanGuruPengganti::query()
            ->where('jadwal_pelajaran_id', $schedule->id)
            ->whereDate('tanggal', $now->toDateString())
            ->where('status_approval', 'APPROVED')
            ->first();
    }

    /**
     * Mengijinkan akses ke jadwal yang benar-benar milik guru atau pengganti yang telah disetujui pada hari itu,
     * aktif pada hari/siklus/semester yang berlaku, dan masih dalam jendela pengisian jurnal.
     * Jika draf sudah dibuka, akses lanjutan tetap diperbolehkan.
     */
    private function authorizeSchedule(Request $request, JadwalPelajaran $schedule, Carbon $now, CycleScheduleService $cycles, KalenderJamPelajaranResolver $calendarResolver): void
    {
        $activeSubstitute = $this->activeSubstituteForSchedule($schedule, $now);
        $allowedUserIds = [$schedule->user_id];
        if ($activeSubstitute && $activeSubstitute->guru_pengganti_id) {
            $allowedUserIds[] = $activeSubstitute->guru_pengganti_id;
        }

        if (! in_array($request->user()->id, $allowedUserIds, true)) {
            abort(403, 'Guru hanya dapat mengisi jadwal yang ditugaskan kepadanya atau yang telah disetujui sebagai pengganti.');
        }
        if ($schedule->tahunAjaran?->is_active !== true || $schedule->hari !== $cycles->getHariIndo($now)) {
            throw new ConflictHttpException('Jadwal tidak aktif untuk tanggal hari ini.');
        }
        $semester = Setting::value('active_semester') ?: ($now->month >= 7 ? 'Ganjil' : 'Genap');
        if ($schedule->semester !== $semester) {
            throw new ConflictHttpException('Jadwal bukan bagian semester aktif.');
        }
        $cycle = $cycles->getCurrentCycle($now, Setting::value('semester_start_date', config('aksara.academic.semester_start_date')));
        if ($schedule->siklus_minggu !== null && (int) $schedule->siklus_minggu !== $cycle) {
            throw new ConflictHttpException('Jadwal tidak aktif pada siklus minggu ini.');
        }

        $hasOpenDraft = JurnalMengajar::query()
            ->where('jadwal_pelajaran_id', $schedule->id)
            ->whereDate('tanggal', $now->toDateString())
            ->where(fn ($query) => $query->where('user_id', $request->user()->id)->orWhere('guru_pengganti_id', $request->user()->id))
            ->where('status_sesi', JurnalMengajar::STATUS_DRAFT)
            ->exists();
        if ($hasOpenDraft) {
            return;
        }

        try {
            $resolved = $calendarResolver->resolve($schedule, $now);
        } catch (\RuntimeException $exception) {
            throw new ConflictHttpException($exception->getMessage(), $exception);
        }

        if ($now->lt($resolved['jam_mulai']) || $now->gt($resolved['jam_selesai'])) {
            throw new ConflictHttpException(
                'Draf jurnal hanya dapat diisi selama waktu pembelajaran ('
                .$resolved['jam_mulai']->format('H:i').'–'.$resolved['jam_selesai']->format('H:i').').'
            );
        }
    }

    /**
     * Menentukan apakah finalisasi jurnal dibuka untuk saat ini.
     * Jika bukan darurat, sistem hanya menerima pada 30 menit terakhir sesi.
     * Jika darurat, sistem tetap mengizinkan finalisasi selama masih masuk per jangkauan sesi yang valid.
     */
    private function authorizeFinalizationWindow(JadwalPelajaran $schedule, Carbon $now, bool $isEmergency = false): void
    {
        $sessionStart = Carbon::parse($now->toDateString().' '.$schedule->jam_mulai, config('app.timezone'));
        $sessionEnd = Carbon::parse($now->toDateString().' '.$schedule->jam_selesai, config('app.timezone'));
        $windowStart = $sessionEnd->copy()->subMinutes(30);
        if ($windowStart->lt($sessionStart)) $windowStart = $sessionStart;

        if (! $isEmergency && ($now->lt($windowStart) || $now->gt($sessionEnd))) {
            throw new ConflictHttpException('Finalisasi jurnal dibuka pukul '.$windowStart->format('H:i').' dan ditutup pukul '.$sessionEnd->format('H:i').'.');
        }

        if ($isEmergency && $now->gt($sessionEnd)) {
            return;
        }
    }

    /**
     * Mengecek apakah lokasi saat finalisasi masih berada dalam batas geofence sekolah.
     * Jika jarak melebihi radius, finalisasi ditolak sebelum menerima foto atau menutup jurnal.
     */
    private function verifyFinalizationLocation(array $data, HaversineService $distance): float
    {
        $verified = filter_var(Setting::value('geofence_location_verified', false), FILTER_VALIDATE_BOOLEAN);
        $schoolLatitude = Setting::value('geofence_latitude', config('aksara.geofence.latitude'));
        $schoolLongitude = Setting::value('geofence_longitude', config('aksara.geofence.longitude'));
        if (! $verified || $schoolLatitude === null || $schoolLongitude === null) {
            throw ValidationException::withMessages(['location' => 'Lokasi sekolah belum diverifikasi oleh Admin.']);
        }

        $distanceMeters = $distance->calculateDistance(
            (float) $data['latitude'],
            (float) $data['longitude'],
            (float) $schoolLatitude,
            (float) $schoolLongitude,
        );
        $radius = (int) Setting::value('geofence_radius_meters', config('aksara.geofence.radius_meters'));
        if ($distanceMeters > $radius) {
            throw ValidationException::withMessages(['location' => 'Finalisasi harus dilakukan di area sekolah. Jarak terdeteksi '.$distanceMeters.' m, sedangkan batas geofence '.$radius.' m.']);
        }

        return $distanceMeters;
    }
}
