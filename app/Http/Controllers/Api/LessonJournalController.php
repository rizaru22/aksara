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

        return response()->json(['data' => DB::table('siswas')->where('kelas_id', $jadwalPelajaran->kelas_id)->orderBy('nama')->get(['id', 'nisn', 'nama'])]);
    }

    public function store(Request $request, CycleScheduleService $cycles)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);
        $data = $request->validate([
            'jadwal_pelajaran_id' => ['required', 'integer', 'exists:jadwal_pelajarans,id'],
            'materi_pelajaran_id' => ['nullable', 'integer', 'exists:materi_pelajarans,id'],
            'materi_pembahasan' => ['required', 'string', 'min:3', 'max:10000'],
            'catatan_kejadian_kelas' => ['nullable', 'string', 'max:10000'],
            'foto_kegiatan' => ['nullable', 'image', 'max:5120'],
            'presensi' => ['required', 'array', 'min:1'],
            'presensi.*.siswa_id' => ['required', 'integer', 'distinct', 'exists:siswas,id'],
            'presensi.*.status' => ['required', 'in:HADIR,SAKIT,IZIN,ALPHA,CABUT'],
            'presensi.*.keterangan' => ['nullable', 'string', 'max:255'],
        ]);

        $now = now(config('app.timezone'));
        $schedule = JadwalPelajaran::query()->with('kelas')->findOrFail($data['jadwal_pelajaran_id']);
        $this->authorizeSchedule($request, $schedule, $now, $cycles);
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

        $photoPath = $request->file('foto_kegiatan')?->store('lesson-journals', 'local');
        try {
            $journal = DB::transaction(function () use ($request, $data, $schedule, $now, $photoPath): JurnalMengajar {
                $lockedSchedule = JadwalPelajaran::query()->lockForUpdate()->findOrFail($schedule->id);
                $existing = JurnalMengajar::query()
                    ->where('jadwal_pelajaran_id', $lockedSchedule->id)
                    ->whereDate('tanggal', $now->toDateString())
                    ->exists();
                if ($existing) {
                    throw new ConflictHttpException('Jurnal untuk sesi jadwal ini sudah pernah dikirim.');
                }

                if (AgendaSekolah::query()
                    ->whereDate('tanggal', $now->toDateString())
                    ->where('scope', 'SEKOLAH')
                    ->where('override_kbm', true)
                    ->where('jam_mulai', '<', $lockedSchedule->jam_selesai)
                    ->where('jam_selesai', '>', $lockedSchedule->jam_mulai)
                    ->exists()) {
                    throw new ConflictHttpException('KBM pada waktu sesi ini ditangguhkan oleh agenda sekolah.');
                }

                $journal = JurnalMengajar::query()->create([
                    'user_id' => $request->user()->id,
                    'jadwal_pelajaran_id' => $lockedSchedule->id,
                    'materi_pelajaran_id' => $data['materi_pelajaran_id'] ?? null,
                    'tanggal' => $now->toDateString(),
                    'materi_pembahasan' => $data['materi_pembahasan'],
                    'catatan_kejadian_kelas' => $data['catatan_kejadian_kelas'] ?? null,
                    'foto_kegiatan' => $photoPath,
                    'jam_selesai_realisasi' => $now,
                    'status_sesi' => 'selesai',
                ]);

                $journal->presensiSiswas()->createMany(collect($data['presensi'])->map(fn (array $attendance) => [
                    'siswa_id' => $attendance['siswa_id'],
                    'status' => $attendance['status'],
                    'keterangan' => $attendance['keterangan'] ?? null,
                ])->all());

                return $journal->load(['jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran', 'presensiSiswas.siswa']);
            });
        } catch (\Throwable $exception) {
            if ($photoPath) Storage::disk('local')->delete($photoPath);
            throw $exception;
        }

        return response()->json(['message' => 'E-Jurnal dan presensi siswa berhasil disimpan.', 'data' => $journal], 201);
    }

    public function show(Request $request, JurnalMengajar $jurnalMengajar)
    {
        $user = $request->user();
        $canManage = $user->hasRole('admin') || $user->can('view-dashboard-kurikulum');
        abort_unless($jurnalMengajar->user_id === $user->id || $canManage, 403);

        return response()->json(['data' => $jurnalMengajar->load(['jadwalPelajaran.kelas', 'jadwalPelajaran.mataPelajaran', 'presensiSiswas.siswa'])]);
    }

    public function uploadPhoto(Request $request, JurnalMengajar $jurnalMengajar)
    {
        abort_unless($request->user()->can('isi-ejurnal'), 403);
        abort_unless($jurnalMengajar->user_id === $request->user()->id, 403, 'Anda hanya dapat mengunggah foto untuk jurnal sendiri.');

        $data = $request->validate([
            'foto_kegiatan' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $previousPhoto = $jurnalMengajar->foto_kegiatan;
        $jurnalMengajar->foto_kegiatan = $data['foto_kegiatan']->store('lesson-journals', 'local');
        $jurnalMengajar->save();

        if ($previousPhoto) {
            Storage::disk('local')->delete($previousPhoto);
        }

        return response()->json(['message' => 'Foto kegiatan berhasil diunggah.', 'data' => $jurnalMengajar->refresh()]);
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
        if ($now->lt($start) || $now->gt($end->copy()->addMinutes(30))) {
            throw new ConflictHttpException('E-Jurnal hanya dapat dikirim selama sesi hari ini atau hingga 30 menit sesudahnya.');
        }
    }
}
