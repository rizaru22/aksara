<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JadwalPelajaran;
use App\Models\Kelas;
use App\Models\MataPelajaran;
use App\Models\PenempatanSiswa;
use App\Models\MateriPelajaran;
use App\Models\Siswa;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Services\SimpleXlsx;
use App\Services\CycleScheduleService;
use App\Services\KalenderJamPelajaranResolver;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

class AcademicImportController extends Controller
{
    private const TEMPLATES = [
        'classes' => ['Kelas', ['tahun_ajaran', 'nama_kelas', 'tingkat', 'jurusan', 'wali_kelas_nip']],
        'students' => ['Siswa', ['nisn', 'nama', 'jenis_kelamin']],
        'subjects' => ['Mata_Pelajaran', ['kode_mapel', 'nama_mapel']],
        'materials' => ['Materi_Pelajaran', ['kode_mapel', 'urutan_bab', 'judul_bab', 'target_jjp']],
        'schedules' => ['Jadwal_Pelajaran', ['tahun_ajaran', 'semester', 'nip_guru', 'nama_kelas', 'kode_mapel', 'siklus_minggu', 'hari', 'periode_mulai', 'periode_selesai']],
    ];

    /**
     * Endpoint GET /api/v1/master-data/import/template/{resource}.
     * Menghasilkan file Excel template sesuai resource yang dipilih, misalnya kelas, siswa, mapel, materi, atau jadwal.
     * File ini dipakai agar admin bisa menyiapkan data master dengan format yang konsisten sebelum di-import.
     */
    public function template(Request $request, string $resource, SimpleXlsx $xlsx)
    {
        abort_unless(isset(self::TEMPLATES[$resource]), 404);
        if (! class_exists(\ZipArchive::class)) return response()->json(['message' => 'Aktifkan ekstensi PHP zip untuk membuat template Excel.'], 503);
        [$sheet, $headers] = self::TEMPLATES[$resource];
        $content = $xlsx->write($headers, $sheet);
        return response($content, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="template_'.$resource.'.xlsx"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    /**
     * Endpoint POST /api/v1/master-data/import/{resource}.
     * Memvalidasi file Excel, memetakan setiap baris ke struktur data backend, lalu mengeksekusi import dalam transaksi database.
     * Flow ini menahan semua proses jika ada data duplikat, konflik jadwal, atau format kolom tidak sesuai template.
     */
    public function import(Request $request, string $resource, SimpleXlsx $xlsx)
    {
        abort_unless(isset(self::TEMPLATES[$resource]), 404);
        $request->validate(['file' => 'required|file|mimes:xlsx|max:10240']);
        $classId = $resource === 'students'
            ? $request->validate([
                'class_id' => 'required|integer|exists:kelas,id',
                'tahun_ajaran_id' => 'required|integer|exists:tahun_ajarans,id',
            ])['class_id']
            : null;
        $placementYearId = $resource === 'students' ? (int) $request->input('tahun_ajaran_id') : null;
        if ($resource === 'students' && (int) Kelas::query()->findOrFail($classId)->tahun_ajaran_id !== $placementYearId) {
            throw ValidationException::withMessages(['class_id' => 'Kelas harus berasal dari tahun ajaran yang dipilih.']);
        }
        if (! class_exists(\ZipArchive::class)) return response()->json(['message' => 'Aktifkan ekstensi PHP zip untuk mengimpor file Excel.'], 503);

        try {
            $rows = $xlsx->read($request->file('file')->getRealPath());
            $expected = self::TEMPLATES[$resource][1];
            $headers = array_keys($rows[0] ?? []);
            $missing = array_values(array_diff($expected, $headers));
            if ($missing) throw ValidationException::withMessages(['file' => 'Kolom template tidak lengkap: '.implode(', ', $missing).'. Unduh template terbaru.']);
            if (count($rows) > 2000) throw ValidationException::withMessages(['file' => 'Maksimum 2.000 baris data per impor.']);
            $records = $this->mapRows($resource, $rows, $classId);
            DB::transaction(function () use ($resource, $records, $classId, $placementYearId): void {
                foreach ($records as $record) {
                    match ($resource) {
                        'classes' => Kelas::query()->create($record),
                        'students' => (function () use ($record, $classId, $placementYearId) {
                            $student = Siswa::query()->create($record);
                            PenempatanSiswa::query()->create(['siswa_id' => $student->id, 'kelas_id' => $classId, 'tahun_ajaran_id' => $placementYearId]);
                            return $student;
                        })(),
                        'subjects' => MataPelajaran::query()->create($record),
                        'materials' => MateriPelajaran::query()->create($record),
                        'schedules' => JadwalPelajaran::query()->create($record),
                    };
                }
            });
            return response()->json(['message' => count($records).' baris berhasil diimpor.', 'data' => ['imported' => count($records), 'failed' => 0]]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (RuntimeException $exception) {
            throw ValidationException::withMessages(['file' => $exception->getMessage()]);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['message' => 'Impor dibatalkan karena ada data yang tidak valid atau bertabrakan. Tidak ada baris yang disimpan. Periksa nilai unik dan konflik jadwal.'], 422);
        }
    }

    /**
     * Memetakan semua baris Excel dari satu resource ke struktur data yang siap divalidasi sebelum disimpan.
     * Setiap baris diperiksa satu per satu agar error bisa diidentifikasi dengan nomor baris yang tepat.
     */
    private function mapRows(string $resource, array $rows, ?int $classId = null): array
    {
        $mapped = [];
        $errors = [];
        foreach ($rows as $offset => $row) {
            $line = $offset + 2;
            try {
                $record = match ($resource) {
                    'classes' => $this->classRow($row),
                    'students' => $this->studentRow($row, $classId),
                    'subjects' => $this->subjectRow($row),
                    'materials' => $this->materialRow($row),
                    'schedules' => $this->scheduleRow($row),
                };
                Validator::make($record, $this->rules($resource))->validate();
                $this->validateDuplicate($resource, $record, $mapped);
                if ($resource === 'schedules') $this->validateScheduleCollision($record, $mapped);
                $mapped[] = $record;
            } catch (ValidationException $exception) {
                $errors[] = 'Baris '.$line.': '.implode(' ', array_merge(...array_values($exception->errors())));
            } catch (RuntimeException $exception) {
                $errors[] = 'Baris '.$line.': '.$exception->getMessage();
            }
        }
        if ($errors) throw ValidationException::withMessages(['file' => $errors]);
        if (! $mapped) throw ValidationException::withMessages(['file' => 'Tidak ada baris data yang dapat diimpor.']);
        return $mapped;
    }

    /**
     * Mengubah representasi baris kelas menjadi data model Kelas yang siap disimpan atau divalidasi.
     */
    private function classRow(array $row): array
    {
        $wali = $this->optionalTeacher($row['wali_kelas_nip'] ?? '');
        $year = TahunAjaran::query()->where('tahun_ajaran', trim($row['tahun_ajaran'] ?? ''))->first();
        if (! $year) throw new RuntimeException('Tahun ajaran kelas tidak ditemukan.');
        return ['tahun_ajaran_id' => $year->id, 'nama_kelas' => trim($row['nama_kelas'] ?? ''), 'tingkat' => trim($row['tingkat'] ?? ''), 'jurusan' => trim($row['jurusan'] ?? ''), 'wali_kelas_id' => $wali?->id];
    }

    /**
     * Mengubah baris siswa menjadi payload yang sesuai schema model Siswa serta mengikat ke kelas tujuan.
     */
    private function studentRow(array $row, ?int $classId): array
    {
        return ['nisn' => trim($row['nisn'] ?? ''), 'nama' => trim($row['nama'] ?? ''), 'jenis_kelamin' => strtoupper(trim($row['jenis_kelamin'] ?? ''))];
    }

    private function subjectRow(array $row): array
    {
        return ['kode_mapel' => $row['kode_mapel'] ?? '', 'nama_mapel' => $row['nama_mapel'] ?? ''];
    }

    private function materialRow(array $row): array
    {
        $subject = MataPelajaran::query()->where('kode_mapel', trim($row['kode_mapel'] ?? ''))->first();
        if (! $subject) throw new RuntimeException('Mata pelajaran dengan kode "'.($row['kode_mapel'] ?? '').'" tidak ditemukan.');
        return ['mata_pelajaran_id' => $subject->id, 'urutan_bab' => $row['urutan_bab'] ?? '', 'judul_bab' => $row['judul_bab'] ?? '', 'target_jjp' => $row['target_jjp'] ?? ''];
    }

    private function scheduleRow(array $row): array
    {
        $year = TahunAjaran::query()->where('tahun_ajaran', trim($row['tahun_ajaran'] ?? ''))->first();
        $teacher = User::query()->where('nip', trim($row['nip_guru'] ?? ''))->role(['guru', 'admin', 'kurikulum', 'kepsek'])->first();
        $class = Kelas::query()->where('nama_kelas', trim($row['nama_kelas'] ?? ''))->first();
        $subject = MataPelajaran::query()->where('kode_mapel', trim($row['kode_mapel'] ?? ''))->first();
        if (! $year) throw new RuntimeException('Tahun ajaran tidak ditemukan; gunakan format yang sama seperti data master.');
        if (! $teacher) throw new RuntimeException('Guru dengan NIP tersebut tidak ditemukan.');
        if (! $class) throw new RuntimeException('Kelas tidak ditemukan.');
        if (! $subject) throw new RuntimeException('Mata pelajaran tidak ditemukan.');
        $periodeMulai = filter_var($row['periode_mulai'] ?? null, FILTER_VALIDATE_INT);
        $periodeSelesai = filter_var($row['periode_selesai'] ?? null, FILTER_VALIDATE_INT);
        if ($periodeMulai === false || $periodeSelesai === false || $periodeMulai === null || $periodeSelesai === null) {
            throw new RuntimeException('Periode mulai dan periode selesai wajib diisi dengan nomor periode pada kalender aktif.');
        }
        if ($periodeMulai < 1 || $periodeSelesai < $periodeMulai) {
            throw new RuntimeException('Rentang periode tidak valid. Periode selesai harus sama dengan atau lebih besar dari periode mulai.');
        }
        $record = [
            'tahun_ajaran_id' => $year->id, 'semester' => $row['semester'] ?? '', 'user_id' => $teacher->id,
            'kelas_id' => $class->id, 'mata_pelajaran_id' => $subject->id,
            'siklus_minggu' => ($row['siklus_minggu'] ?? '') === '' ? null : $row['siklus_minggu'],
            'hari' => ucfirst(strtolower($row['hari'] ?? '')),
            'periode_mulai' => $periodeMulai, 'periode_selesai' => $periodeSelesai,
            'jam_mulai' => null, 'jam_selesai' => null,
        ];
        $date = CarbonImmutable::today(config('app.timezone'));
        $cycles = app(CycleScheduleService::class);
        for ($offset = 0; $offset < 7 && $cycles->getHariIndo($date) !== $record['hari']; $offset++) {
            $date = $date->addDay();
        }
        $resolved = app(KalenderJamPelajaranResolver::class)->resolve(new JadwalPelajaran($record), $date);

        // Kolom waktu masih NOT NULL pada database lama maupun saat ini.
        // Simpan waktu hasil resolusi kalender untuk kompatibilitas skema;
        // periode tetap menjadi sumber waktu utama ketika jadwal dibaca.
        $record['jam_mulai'] = $resolved['jam_mulai']->format('H:i:s');
        $record['jam_selesai'] = $resolved['jam_selesai']->format('H:i:s');

        return $record;
    }

    private function optionalTeacher(string $nip): ?User
    {
        if (trim($nip) === '') return null;
        $teacher = User::query()->where('nip', trim($nip))->role(['guru', 'admin', 'kurikulum', 'kepsek'])->first();
        if (! $teacher) throw new RuntimeException('Wali kelas dengan NIP "'.$nip.'" tidak ditemukan.');
        return $teacher;
    }

    private function timeValue(string $value): string
    {
        if (is_numeric($value) && (float) $value >= 0 && (float) $value < 1) {
            $minutes = (int) round((float) $value * 1440);
            return sprintf('%02d:%02d', intdiv($minutes, 60) % 24, $minutes % 60);
        }
        return trim($value);
    }

    private function rules(string $resource): array
    {
        return match ($resource) {
            'classes' => ['tahun_ajaran_id' => 'required|exists:tahun_ajarans,id', 'nama_kelas' => 'required|string|max:255', 'tingkat' => 'required|string|max:50', 'jurusan' => 'required|string|max:100', 'wali_kelas_id' => 'nullable|exists:users,id'],
            'students' => ['nisn' => 'required|string|max:255|unique:siswas,nisn', 'nama' => 'required|string|max:255', 'jenis_kelamin' => 'required|in:L,P'],
            'subjects' => ['kode_mapel' => 'required|string|max:255|unique:mata_pelajarans,kode_mapel', 'nama_mapel' => 'required|string|max:255'],
            'materials' => ['mata_pelajaran_id' => 'required|exists:mata_pelajarans,id', 'urutan_bab' => 'required|integer|min:1', 'judul_bab' => 'required|string|max:255', 'target_jjp' => 'required|integer|min:1'],
            'schedules' => ['tahun_ajaran_id' => 'required|exists:tahun_ajarans,id', 'semester' => 'required|in:Ganjil,Genap', 'user_id' => 'required|exists:users,id', 'kelas_id' => 'required|exists:kelas,id', 'mata_pelajaran_id' => 'required|exists:mata_pelajarans,id', 'siklus_minggu' => 'nullable|integer|in:1,2,3', 'hari' => 'required|in:Senin,Selasa,Rabu,Kamis,Jumat,Sabtu', 'periode_mulai' => 'required|integer|min:1', 'periode_selesai' => 'required|integer|gte:periode_mulai'],
        };
    }

    private function validateDuplicate(string $resource, array $record, array $previous): void
    {
        $unique = match ($resource) { 'classes' => ['nama_kelas'], 'students' => ['nisn'], 'subjects' => ['kode_mapel'], default => null };
        if ($unique && $this->duplicateInDatabase($resource, $record[$unique[0]])) throw ValidationException::withMessages([$unique[0] => 'nilai sudah digunakan']);
        if ($unique) foreach ($previous as $item) if ($item[$unique[0]] === $record[$unique[0]]) throw ValidationException::withMessages([$unique[0] => 'nilai duplikat pada file']);
    }

    private function duplicateInDatabase(string $resource, string $value): bool
    {
        return match ($resource) {
            'classes' => false,
            'students' => Siswa::query()->where('nisn', $value)->exists(),
            'subjects' => MataPelajaran::query()->where('kode_mapel', $value)->exists(),
            default => false,
        };
    }

    private function validateScheduleCollision(array $record, array $previous): void
    {
        $date = CarbonImmutable::today(config('app.timezone'));
        $cycles = app(CycleScheduleService::class);
        for ($offset = 0; $offset < 7 && $cycles->getHariIndo($date) !== $record['hari']; $offset++) {
            $date = $date->addDay();
        }

        $resolver = app(KalenderJamPelajaranResolver::class);
        try {
            $candidateTime = $resolver->resolve(new JadwalPelajaran($record), $date);
            $conflicts = function (JadwalPelajaran $other) use ($record, $candidateTime, $resolver, $date): bool {
                if ($record['tahun_ajaran_id'] !== $other->tahun_ajaran_id
                    || $record['semester'] !== $other->semester
                    || $record['hari'] !== $other->hari
                    || ($record['siklus_minggu'] !== null && $other->siklus_minggu !== null
                        && (string) $record['siklus_minggu'] !== (string) $other->siklus_minggu)) {
                    return false;
                }
                if ($record['user_id'] !== $other->user_id && $record['kelas_id'] !== $other->kelas_id) {
                    return false;
                }
                $otherTime = $resolver->resolve($other, $date);
                return $candidateTime['jam_mulai'] < $otherTime['jam_selesai']
                    && $candidateTime['jam_selesai'] > $otherTime['jam_mulai'];
            };

            foreach ($previous as $otherRecord) {
                if ($conflicts(new JadwalPelajaran($otherRecord))) {
                    throw ValidationException::withMessages(['jadwal' => 'bertabrakan dengan jadwal guru atau kelas yang lain']);
                }
            }

            $existing = JadwalPelajaran::query()
                ->where('tahun_ajaran_id', $record['tahun_ajaran_id'])
                ->where('semester', $record['semester'])
                ->where('hari', $record['hari'])
                ->where(function ($query) use ($record): void {
                    if ($record['siklus_minggu'] !== null) {
                        $query->whereNull('siklus_minggu')->orWhere('siklus_minggu', $record['siklus_minggu']);
                    }
                })
                ->where(fn ($query) => $query->where('user_id', $record['user_id'])->orWhere('kelas_id', $record['kelas_id']))
                ->get();

            if ($existing->contains($conflicts)) {
                throw ValidationException::withMessages(['jadwal' => 'bertabrakan dengan jadwal guru atau kelas yang lain']);
            }
        } catch (RuntimeException $exception) {
            throw ValidationException::withMessages(['jadwal' => 'Konflik jadwal tidak dapat divalidasi: '.$exception->getMessage()]);
        }
    }
}
