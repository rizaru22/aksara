<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgendaSekolah;
use App\Models\JadwalPelajaran;
use App\Models\JurnalMengajar;
use App\Models\PresensiSiswa;
use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Services\CycleScheduleService;
use App\Services\HaversineService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class LessonJournalController extends Controller
{
    public function students(Request $request, JadwalPelajaran $jadwalPelajaran, CycleScheduleService $cycles)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);
        $now = now(config('app.timezone'));
        $this->authorizeSchedule($request, $jadwalPelajaran, $now, $cycles);

        $draft = JurnalMengajar::query()->with('presensiSiswas')
            ->where('user_id', $request->user()->id)
            ->where('jadwal_pelajaran_id', $jadwalPelajaran->id)
            ->whereDate('tanggal', $now->toDateString())
            ->where('status_sesi', 'berlangsung')
            ->first();

        return response()->json([
            'data' => DB::table('siswas')->where('kelas_id', $jadwalPelajaran->kelas_id)->orderBy('nama')->get(['id', 'nisn', 'nama']),
            'draft' => $draft,
        ]);
    }

    public function store(Request $request, CycleScheduleService $cycles)
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
        $this->authorizeSchedule($request, $schedule, $now, $cycles);
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

        [$journal, $created] = DB::transaction(function () use ($request, $data, $schedule, $now): array {
            $lockedSchedule = JadwalPelajaran::query()->lockForUpdate()->findOrFail($schedule->id);
            if (AgendaSekolah::query()
                ->whereDate('tanggal', $now->toDateString())
                ->where('scope', 'SEKOLAH')
                ->where('override_kbm', true)
                ->where('jam_mulai', '<', $lockedSchedule->jam_selesai)
                ->where('jam_selesai', '>', $lockedSchedule->jam_mulai)
                ->exists()) {
                throw new ConflictHttpException('KBM pada waktu sesi ini ditangguhkan oleh agenda sekolah.');
            }

            $journal = JurnalMengajar::query()
                ->where('jadwal_pelajaran_id', $lockedSchedule->id)
                ->whereDate('tanggal', $now->toDateString())
                ->lockForUpdate()
                ->first();
            if ($journal && $journal->status_sesi !== 'berlangsung') {
                throw new ConflictHttpException('Jurnal sesi ini sudah selesai dan tidak dapat diubah.');
            }
            $created = ! $journal;
            $journal ??= new JurnalMengajar;
            $journal->fill([
                'user_id' => $request->user()->id,
                'jadwal_pelajaran_id' => $lockedSchedule->id,
                'materi_pelajaran_id' => $data['materi_pelajaran_id'] ?? null,
                'tanggal' => $now->toDateString(),
                'materi_pembahasan' => $data['materi_pembahasan'],
                'catatan_kejadian_kelas' => $data['catatan_kejadian_kelas'] ?? null,
                'jam_mulai_realisasi' => $journal->jam_mulai_realisasi ?? $now,
                'jam_selesai_realisasi' => null,
                'status_sesi' => 'berlangsung',
            ])->save();

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

    public function show(Request $request, JurnalMengajar $jurnalMengajar)
    {
        $user = $request->user();
        $canManage = $user->hasRole('admin') || $user->can('view-dashboard-kurikulum');
        abort_unless($jurnalMengajar->user_id === $user->id || $canManage, 403);

        return response()->json(['data' => $jurnalMengajar->load(['jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran', 'presensiSiswas.siswa'])]);
    }

    public function finalize(Request $request, JurnalMengajar $jurnalMengajar, CycleScheduleService $cycles, HaversineService $distance)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);
        abort_unless($jurnalMengajar->user_id === $request->user()->id, 403, 'Anda hanya dapat memfinalisasi draf jurnal sendiri.');
        $data = $request->validate([
            'foto_kegiatan' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['required', 'numeric', 'min:0', 'max:3'],
            'darurat' => ['nullable', 'boolean'],
            'catatan_penutupan' => ['nullable', 'string', 'max:2000'],
        ]);
        if ($jurnalMengajar->status_sesi !== 'berlangsung') {
            throw new ConflictHttpException('Hanya draf jurnal yang dapat difinalisasi.');
        }
        $now = now(config('app.timezone'));
        $schedule = $jurnalMengajar->jadwalPelajaran()->firstOrFail();
        $this->authorizeSchedule($request, $schedule, $now, $cycles);
        $isEmergency = filter_var($data['darurat'] ?? false, FILTER_VALIDATE_BOOLEAN) || filled($data['catatan_penutupan'] ?? null);
        $this->authorizeFinalizationWindow($schedule, $now, $isEmergency);
        $distanceMeters = $this->verifyFinalizationLocation($data, $distance);

        $expectedIds = DB::table('siswas')->where('kelas_id', $schedule->kelas_id)->pluck('id')->map(fn ($id) => (int) $id)->sort()->values();
        $draftIds = $jurnalMengajar->presensiSiswas()->pluck('siswa_id')->map(fn ($id) => (int) $id)->sort()->values();
        if ($expectedIds->isEmpty() || $expectedIds->all() !== $draftIds->all()) {
            throw ValidationException::withMessages(['presensi' => 'Perbarui draf agar mencakup seluruh siswa kelas sebelum finalisasi.']);
        }

        $photoPath = $data['foto_kegiatan']->store('lesson-journals', 'local');
        try {
            $journal = DB::transaction(function () use ($jurnalMengajar, $data, $now, $distanceMeters, $photoPath): JurnalMengajar {
                $journal = JurnalMengajar::query()->lockForUpdate()->findOrFail($jurnalMengajar->id);
                if ($journal->status_sesi !== 'berlangsung') {
                    throw new ConflictHttpException('Draf jurnal sudah difinalisasi.');
                }
                $journal->fill([
                    'foto_kegiatan' => $photoPath,
                    'lat_finalisasi' => $data['latitude'],
                    'long_finalisasi' => $data['longitude'],
                    'gps_accuracy_finalisasi' => $data['accuracy'],
                    'jarak_geofence_finalisasi' => $distanceMeters,
                    'jam_selesai_realisasi' => $now,
                    'status_sesi' => 'selesai',
                    'catatan_penutupan' => $data['catatan_penutupan'] ?? null,
                ])->save();

                return $journal->load(['jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran', 'presensiSiswas.siswa']);
            });
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($photoPath);
            throw $exception;
        }

        $message = ($data['darurat'] ?? false) || filled($data['catatan_penutupan'] ?? null)
            ? 'Jurnal dan presensi siswa berhasil difinalisasi dengan catatan darurat.'
            : 'Jurnal dan presensi siswa berhasil difinalisasi.';

        return response()->json(['message' => $message, 'data' => $journal]);
    }

    public function updateStudentAttendance(Request $request, PresensiSiswa $presensiSiswa)
    {
        $user = $request->user();
        abort_unless($user->can('kelola-presensi-siswa'), 403);
        $journal = $presensiSiswa->jurnalMengajar()->with('jadwalPelajaran')->firstOrFail();
        $class = $journal->jadwalPelajaran->kelas_id;
        $isAdmin = $user->hasRole('admin');
        $isWali = DB::table('kelas')->where('id', $class)->where('wali_kelas_id', $user->id)->exists();
        abort_unless($isAdmin || $isWali, 403, 'Koreksi hanya dapat dilakukan Admin atau wali kelas terkait.');

        $data = $request->validate([
            'status' => ['required', 'in:HADIR,SAKIT,IZIN,ALPHA,CABUT'],
            'keterangan' => ['nullable', 'string', 'max:255'],
        ]);
        $presensiSiswa->fill($data)->save();

        return response()->json(['message' => 'Koreksi presensi sesi tersimpan.', 'data' => $presensiSiswa->refresh()]);
    }

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

    private function authorizeSchedule(Request $request, JadwalPelajaran $schedule, Carbon $now, CycleScheduleService $cycles): void
    {
        if ($schedule->user_id !== $request->user()->id) {
            abort(403, 'Guru hanya dapat mengisi jadwal yang ditugaskan kepadanya.');
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
        $start = Carbon::parse($now->toDateString().' '.$schedule->jam_mulai, config('app.timezone'));
        $end = Carbon::parse($now->toDateString().' '.$schedule->jam_selesai, config('app.timezone'));
        if ($now->lt($start) || $now->gt($end)) {
            throw new ConflictHttpException('Draf jurnal hanya dapat diisi selama waktu pembelajaran.');
        }
    }

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
