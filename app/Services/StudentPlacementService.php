<?php

namespace App\Services;

use App\Models\ArsipSiswa;
use App\Models\Kelas;
use App\Models\PenempatanSiswa;
use App\Models\Siswa;
use App\Models\TahunAjaran;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StudentPlacementService
{
    public function place(int $studentId, int $classId, int $academicYearId): PenempatanSiswa
    {
        return DB::transaction(function () use ($studentId, $classId, $academicYearId): PenempatanSiswa {
            $student = Siswa::query()->findOrFail($studentId);
            $class = Kelas::query()->findOrFail($classId);
            if ((int) $class->tahun_ajaran_id !== $academicYearId) {
                throw ValidationException::withMessages(['kelas_id' => 'Kelas tidak termasuk tahun ajaran yang dipilih.']);
            }
            if (ArsipSiswa::query()->where('siswa_id', $student->id)->exists()) {
                throw ValidationException::withMessages(['siswa_id' => 'Siswa sudah diarsipkan sebagai lulusan.']);
            }

            return PenempatanSiswa::query()->updateOrCreate(
                ['siswa_id' => $student->id, 'tahun_ajaran_id' => $academicYearId],
                ['kelas_id' => $class->id],
            );
        });
    }

    public function archive(int $studentId, int $graduationYearId, string $graduationDate, ?string $note = null): ArsipSiswa
    {
        return DB::transaction(function () use ($studentId, $graduationYearId, $graduationDate, $note): ArsipSiswa {
            $student = Siswa::query()->findOrFail($studentId);
            TahunAjaran::query()->findOrFail($graduationYearId);

            if (PenempatanSiswa::query()->where('siswa_id', $student->id)->where('tahun_ajaran_id', $graduationYearId)->doesntExist()) {
                throw ValidationException::withMessages(['siswa_id' => 'Siswa tidak memiliki penempatan pada tahun ajaran kelulusan.']);
            }

            return ArsipSiswa::query()->firstOrCreate(
                ['siswa_id' => $student->id],
                ['tahun_ajaran_lulus_id' => $graduationYearId, 'tanggal_lulus' => $graduationDate, 'catatan' => $note],
            );
        });
    }

    public function promote(array $placements, int $targetYearId): array
    {
        return DB::transaction(function () use ($placements, $targetYearId): array {
            $targetYear = TahunAjaran::query()->findOrFail($targetYearId);
            $created = [];
            foreach ($placements as $placement) {
                $student = Siswa::query()->findOrFail((int) $placement['siswa_id']);
                $class = Kelas::query()->findOrFail((int) $placement['kelas_id']);
                if ((int) $class->tahun_ajaran_id !== (int) $targetYear->id) {
                    throw ValidationException::withMessages(['placements' => 'Semua kelas tujuan harus berada pada tahun ajaran tujuan.']);
                }
                if (ArsipSiswa::query()->where('siswa_id', $student->id)->exists()) {
                    throw ValidationException::withMessages(['placements' => "Siswa {$student->nama} sudah diarsipkan."]);
                }
                if (PenempatanSiswa::query()->where('siswa_id', $student->id)->where('tahun_ajaran_id', $targetYear->id)->exists()) {
                    throw ValidationException::withMessages(['placements' => "Siswa {$student->nama} sudah memiliki penempatan pada tahun ajaran tujuan."]);
                }
                $created[] = PenempatanSiswa::query()->create([
                    'siswa_id' => $student->id,
                    'kelas_id' => $class->id,
                    'tahun_ajaran_id' => $targetYear->id,
                ]);
            }
            return $created;
        });
    }
}
