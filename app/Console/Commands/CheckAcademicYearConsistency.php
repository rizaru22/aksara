<?php

namespace App\Console\Commands;

use App\Services\ActiveAcademicYearService;
use Illuminate\Console\Command;
use Throwable;

class CheckAcademicYearConsistency extends Command
{
    protected $signature = 'aksara:check-academic-year {--repair-from= : Explicitly choose table or settings as repair source}';

    protected $description = 'Check or explicitly repair active academic year synchronization';

    public function handle(ActiveAcademicYearService $service): int
    {
        $repairFrom = $this->option('repair-from');

        try {
            if ($repairFrom) {
                $year = $service->repairFrom($repairFrom);
                $this->info("Sumber {$repairFrom} disinkronkan ke {$year->tahun_ajaran}.");
            }
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $state = $service->consistency();
        $this->table(['Konsisten', 'Tahun aktif (tabel)', 'Setting', 'Jumlah aktif'], [[
            $state['consistent'] ? 'Ya' : 'Tidak',
            $state['table_value'] ?? '—',
            $state['setting_value'] ?? '—',
            $state['active_years'],
        ]]);

        if (! $state['consistent']) {
            $this->warn('Drift terdeteksi. Periksa sumber otoritatif, lalu jalankan dengan --repair-from=table atau --repair-from=settings.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
