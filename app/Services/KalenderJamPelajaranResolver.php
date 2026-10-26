<?php

namespace App\\Services;

use App\\Models\\JadwalPelajaran;
use App\\Models\\KalenderJamPelajaran;
use Carbon\\CarbonImmutable;
use Carbon\\CarbonInterface;
use Illuminate\\Support\\Facades\\DB;
use RuntimeException;

class KalenderJamPelajaranResolver
{
    /**
     * Resolve planned session time for a schedule on a concrete date.
     *
     * Legacy schedules without period numbers continue to use their stored
     * times. Period-based schedules always use the single active calendar.
     *
     * @return array{
     *   kalender_id: int|null,
     *   tanggal: string,
     *   jam_mulai: CarbonImmutable,
     *   jam_selesai: CarbonImmutable,
     *   periode_mulai: int|null,
     *   periode_selesai: int|null,
     *   sumber: string
     * }
     */
    public function resolve(JadwalPelajaran $jadwal, CarbonInterface|string $tanggal): array
    {
        $date = $tanggal instanceof CarbonInterface
            ? CarbonImmutable::instance($tanggal)->startOfDay()
            : CarbonImmutable::parse($tanggal)->startOfDay();

        $periodeMulai = $jadwal->periode_mulai !== null ? (int) $jadwal->periode_mulai : null;
        $periodeSelesai = $jadwal->periode_selesai !== null ? (int) $jadwal->periode_selesai : null;

        if ($periodeMulai === null && $periodeSelesai === null) {
            return $this->legacyResolution($jadwal, $date);
        }

        if ($periodeMulai === null || $periodeSelesai === null) {
            throw new RuntimeException('Jadwal harus mengisi periode_mulai dan periode_selesai secara bersamaan.');
        }

        if ($periodeMulai < 1 || $periodeSelesai < $periodeMulai) {
            throw new RuntimeException('Rentang periode jadwal tidak valid.');
        }

        return DB::transaction(function () use ($jadwal, $date, $periodeMulai, $periodeSelesai): array {
            $kalenderAktif = KalenderJamPelajaran::query()
                ->where('status', KalenderJamPelajaran::STATUS_AKTIF)
                ->lockForUpdate()
                ->first();

            if (! $kalenderAktif) {
                throw new RuntimeException('Belum ada kalender jam pelajaran yang aktif.');
            }

            $detail = $kalenderAktif->detailPeriode()
                ->where('hari', $jadwal->hari)
                ->whereBetween('nomor_periode', [$periodeMulai, $periodeSelesai])
                ->orderBy('nomor_periode')
                ->get();

            $jumlahDiharapkan = $periodeSelesai - $periodeMulai + 1;
            if ($detail->count() !== $jumlahDiharapkan) {
                throw new RuntimeException(sprintf(
                    'Kalender aktif tidak memiliki semua periode %d–%d untuk hari %s.',
                    $periodeMulai,
                    $periodeSelesai,
                    $jadwal->hari
                ));
            }

            for ($i = 0; $i < $detail->count(); $i++) {
                $periode = $detail[$i];
                $nomorDiharapkan = $periodeMulai + $i;

                if ((int) $periode->nomor_periode !== $nomorDiharapkan) {
                    throw new RuntimeException('Nomor periode kalender harus berurutan tanpa celah.');
                }

                if ($periode->jam_mulai >= $periode->jam_selesai) {
                    throw new RuntimeException('Jam mulai setiap periode harus lebih awal daripada jam selesai.');
                }

                if ($i > 0 && $detail[$i - 1]->jam_selesai > $periode->jam_mulai) {
                    throw new RuntimeException('Periode dalam kalender aktif saling bertumpang tindih.');
                }
            }

            $jamMulai = $detail->first()->jam_mulai;
            $jamSelesai = $detail->last()->jam_selesai;

            return [
                'kalender_id' => (int) $kalenderAktif->id,
                'tanggal' => $date->toDateString(),
                'jam_mulai' => $date->setTimeFromTimeString($jamMulai),
                'jam_selesai' => $date->setTimeFromTimeString($jamSelesai),
                'periode_mulai' => $periodeMulai,
                'periode_selesai' => $periodeSelesai,
                'sumber' => 'kalender_aktif',
            ];
        });
    }

    private function legacyResolution(JadwalPelajaran $jadwal, CarbonImmutable $date): array
    {
        if (empty($jadwal->jam_mulai) || empty($jadwal->jam_selesai)) {
            throw new RuntimeException('Jadwal lama harus memiliki jam_mulai dan jam_selesai.');
        }

        if ($jadwal->jam_mulai >= $jadwal->jam_selesai) {
            throw new RuntimeException('Jam mulai jadwal harus lebih awal daripada jam selesai.');
        }

        return [
            'kalender_id' => null,
            'tanggal' => $date->toDateString(),
            'jam_mulai' => $date->setTimeFromTimeString($jadwal->jam_mulai),
            'jam_selesai' => $date->setTimeFromTimeString($jadwal->jam_selesai),
            'periode_mulai' => null,
            'periode_selesai' => null,
            'sumber' => 'jadwal_legacy',
        ];
    }
}
