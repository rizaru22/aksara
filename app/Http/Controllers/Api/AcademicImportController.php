<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JadwalPelajaran;
use App\Models\Kelas;
use App\Models\MataPelajaran;
use App\Models\MateriPelajaran;
use App\Models\Siswa;
use App\Models\TahunAjaran;
use App\Models\User;
use App\Services\SimpleXlsx;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

class AcademicImportController extends Controller
{
    private const TEMPLATES = [
        'classes' => ['Kelas', ['nama_kelas', 'tingkat', 'jurusan', 'wali_kelas_nip']],
        'students' => ['Siswa', ['nisn', 'nama', 'nama_kelas', 'jenis_kelamin']],
        'subjects' => ['Mata_Pelajaran', ['kode_mapel', 'nama_mapel']],
        'materials' => ['Materi_Pelajaran', ['kode_mapel', 'urutan_bab', 'judul_bab', 'target_jjp']],
        'schedules' => ['Jadwal_Pelajaran', ['tahun_ajaran', 'semester', 'nip_guru', 'nama_kelas', 'kode_mapel', 'siklus_minggu', 'hari', 'jam_mulai', 'jam_selesai']],
    ];

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

    public function import(Request $request, string $resource, SimpleXlsx $xlsx)
    {
        abort_unless(isset(self::TEMPLATES[$resource]), 404);
        $request->validate(['file' => 'required|file|mimes:xlsx|max:10240']);
        if (! class_exists(\ZipArchive::class)) return response()->json(['message' => 'Aktifkan ekstensi PHP zip untuk mengimpor file Excel.'], 503);

        try {
            $rows = $xlsx->read($request->file('file')->getRealPath());
            $expected = self::TEMPLATES[$resource][1];
            $headers = array_keys($rows[0] ?? []);
            $missing = array_values(array_diff($expected, $headers));
            if ($missing) throw ValidationException::withMessages(['file' => 'Kolom template tidak lengkap: '.implode(', ', $missing).'. Unduh template terbaru.']);
            if (count($rows) > 2000) throw ValidationException::withMessages(['file' => 'Maksimum 2.000 baris data per impor.']);
            $records = $this->mapRows($resource, $rows);
            DB::transaction(function () use ($resource, $records): void {
                foreach ($records as $record) {
                    match ($resource) {
                        'classes' => Kelas::query()->create($record),
                        'students' => Siswa::query()->create($record),
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

    private function mapRows(string $resource, array $rows): array
    {
        $mapped = [];
        $errors = [];
        foreach ($rows as $offset => $row) {
            $line = $offset + 2;
            try {
                $record = match ($resource) {
                    'classes' => $this->classRow($row),
                    'students' => $this->studentRow($row),
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

    private function classRow(array $row): array
    {
        $wali = $this->optionalTeacher($row['wali_kelas_nip'] ?? '');
        return ['nama_kelas' => $row['nama_kelas'] ?? '', 'tingkat' => $row['tingkat'] ?? '', 'jurusan' => $row['jurusan'] ?? '', 'wali_kelas_id' => $wali?->id];
    }

    private function studentRow(array $row): array
    {
        $class = Kelas::query()->where('nama_kelas', trim($row['nama_kelas'] ?? ''))->first();
        if (! $class) throw new RuntimeException('Kelas "'.($row['nama_kelas'] ?? '').'" tidak ditemukan; impor kelas lebih dahulu.');
        return ['nisn' => $row['nisn'] ?? '', 'nama' => $row['nama'] ?? '', 'kelas_id' => $class->id, 'jenis_kelamin' => strtoupper($row['jenis_kelamin'] ?? '')];
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
        return [
            'tahun_ajaran_id' => $year->id, 'semester' => $row['semester'] ?? '', 'user_id' => $teacher->id,
            'kelas_id' => $class->id, 'mata_pelajaran_id' => $subject->id,
            'siklus_minggu' => ($row['siklus_minggu'] ?? '') === '' ? null : $row['siklus_minggu'],
            'hari' => ucfirst(strtolower($row['hari'] ?? '')),
            'jam_mulai' => $this->timeValue($row['jam_mulai'] ?? ''), 'jam_selesai' => $this->timeValue($row['jam_selesai'] ?? ''),
        ];
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
            'classes' => ['nama_kelas' => 'required|string|max:255|unique:kelas,nama_kelas', 'tingkat' => 'required|string|max:50', 'jurusan' => 'required|string|max:100', 'wali_kelas_id' => 'nullable|exists:users,id'],
            'students' => ['nisn' => 'required|string|max:255|unique:siswas,nisn', 'nama' => 'required|string|max:255', 'kelas_id' => 'required|exists:kelas,id', 'jenis_kelamin' => 'required|in:L,P'],
            'subjects' => ['kode_mapel' => 'required|string|max:255|unique:mata_pelajarans,kode_mapel', 'nama_mapel' => 'required|string|max:255'],
            'materials' => ['mata_pelajaran_id' => 'required|exists:mata_pelajarans,id', 'urutan_bab' => 'required|integer|min:1', 'judul_bab' => 'required|string|max:255', 'target_jjp' => 'required|integer|min:1'],
            'schedules' => ['tahun_ajaran_id' => 'required|exists:tahun_ajarans,id', 'semester' => 'required|in:Ganjil,Genap', 'user_id' => 'required|exists:users,id', 'kelas_id' => 'required|exists:kelas,id', 'mata_pelajaran_id' => 'required|exists:mata_pelajarans,id', 'siklus_minggu' => 'nullable|integer|in:1,2,3', 'hari' => 'required|in:Senin,Selasa,Rabu,Kamis,Jumat,Sabtu', 'jam_mulai' => 'required|date_format:H:i', 'jam_selesai' => 'required|date_format:H:i|after:jam_mulai'],
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
            'classes' => Kelas::query()->where('nama_kelas', $value)->exists(),
            'students' => Siswa::query()->where('nisn', $value)->exists(),
            'subjects' => MataPelajaran::query()->where('kode_mapel', $value)->exists(),
            default => false,
        };
    }

    private function validateScheduleCollision(array $record, array $previous): void
    {
        $conflicts = fn (array $other): bool => $record['tahun_ajaran_id'] === $other['tahun_ajaran_id']
            && $record['semester'] === $other['semester'] && $record['hari'] === $other['hari']
            && ($record['siklus_minggu'] === null || $other['siklus_minggu'] === null || (string) $record['siklus_minggu'] === (string) $other['siklus_minggu'])
            && $record['jam_mulai'] < $other['jam_selesai'] && $record['jam_selesai'] > $other['jam_mulai']
            && ($record['user_id'] === $other['user_id'] || $record['kelas_id'] === $other['kelas_id']);
        $existing = JadwalPelajaran::query()->where('tahun_ajaran_id', $record['tahun_ajaran_id'])->where('semester', $record['semester'])
            ->where('hari', $record['hari'])->where('jam_mulai', '<', $record['jam_selesai'])->where('jam_selesai', '>', $record['jam_mulai'])
            ->where(fn ($query) => $query->where('user_id', $record['user_id'])->orWhere('kelas_id', $record['kelas_id']))->get()->toArray();
        if (collect($existing)->contains(fn ($other) => $conflicts($other)) || collect($previous)->contains($conflicts)) {
            throw ValidationException::withMessages(['jadwal' => 'bertabrakan dengan jadwal guru atau kelas yang lain']);
        }
    }
}
