<?php

namespace App\Services;

use App\Models\KalenderJamPelajaran;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class KalenderJamPelajaranService
{
    /**
     * Activate a configured calendar and deactivate every other calendar atomically.
     *
     * Locking the existing calendar rows in a stable order serializes concurrent
     * activation attempts for calendars that already exist.
     */
    public function activate(int $kalenderId): KalenderJamPelajaran
    {
        return DB::transaction(function () use ($kalenderId): KalenderJamPelajaran {
            $kalenderList = KalenderJamPelajaran::query()
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            /** @var KalenderJamPelajaran|null $kalender */
            $kalender = $kalenderList->first(
                fn (KalenderJamPelajaran $item): bool => (int) $item->id === $kalenderId
            );

            if (! $kalender) {
                throw (new ModelNotFoundException())->setModel(KalenderJamPelajaran::class, [$kalenderId]);
            }

            $this->assertCalendarValid($kalender);

            // Bulk update avoids model observers seeing an intermediate activation state.
            KalenderJamPelajaran::query()
                ->where('status', KalenderJamPelajaran::STATUS_AKTIF)
                ->update(['status' => KalenderJamPelajaran::STATUS_NONAKTIF]);

            $kalender->status = KalenderJamPelajaran::STATUS_AKTIF;
            $kalender->save();

            return $kalender->refresh();
        });
    }

    private function assertCalendarValid(KalenderJamPelajaran $kalender): void
    {
        $details = $kalender->detailPeriode()
            ->orderBy('hari')
            ->orderBy('nomor_periode')
            ->get()
            ->groupBy('hari');

        if ($details->isEmpty()) {
            throw new RuntimeException('Kalender belum memiliki detail periode.');
        }

        foreach ($details as $hari => $periods) {
            $periods = $periods->values();

            foreach ($periods as $index => $period) {
                $expectedNumber = $index + 1;

                if ((int) $period->nomor_periode !== $expectedNumber) {
                    throw new RuntimeException(
                        "Nomor periode hari {$hari} harus berurutan mulai dari 1 tanpa celah."
                    );
                }

                if ($period->jam_mulai >= $period->jam_selesai) {
                    throw new RuntimeException(
                        "Jam mulai periode hari {$hari} harus lebih awal daripada jam selesai."
                    );
                }

                if ($index > 0) {
                    $previous = $periods[$index - 1];

                    if ($previous->jam_mulai >= $period->jam_mulai) {
                        throw new RuntimeException(
                            "Urutan nomor periode hari {$hari} harus mengikuti urutan waktu."
                        );
                    }

                    if ($previous->jam_selesai > $period->jam_mulai) {
                        throw new RuntimeException(
                            "Periode hari {$hari} tidak boleh saling bertumpang tindih."
                        );
                    }
                }
            }
        }
    }
}
