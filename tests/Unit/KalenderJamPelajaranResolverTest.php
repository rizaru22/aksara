<?php

namespace Tests\Unit;

use App\Models\JadwalPelajaran;
use App\Services\KalenderJamPelajaranResolver;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class KalenderJamPelajaranResolverTest extends TestCase
{
    public function test_legacy_schedule_keeps_its_stored_times(): void
    {
        $schedule = new JadwalPelajaran([
            'hari' => 'Senin',
            'jam_mulai' => '07:30:00',
            'jam_selesai' => '09:00:00',
            'periode_mulai' => null,
            'periode_selesai' => null,
        ]);

        $resolved = (new KalenderJamPelajaranResolver())->resolve($schedule, '2026-10-26');

        $this->assertSame('jadwal_legacy', $resolved['sumber']);
        $this->assertNull($resolved['kalender_id']);
        $this->assertSame('2026-10-26 07:30:00', $resolved['jam_mulai']->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-26 09:00:00', $resolved['jam_selesai']->format('Y-m-d H:i:s'));
    }

    public function test_legacy_schedule_rejects_end_time_before_start_time(): void
    {
        $schedule = new JadwalPelajaran([
            'hari' => 'Senin',
            'jam_mulai' => '09:00:00',
            'jam_selesai' => '07:30:00',
        ]);

        $this->expectException(RuntimeException::class);
        (new KalenderJamPelajaranResolver())->resolve($schedule, '2026-10-26');
    }

    public function test_schedule_with_only_one_period_boundary_is_rejected(): void
    {
        $schedule = new JadwalPelajaran([
            'hari' => 'Senin',
            'jam_mulai' => '07:30:00',
            'jam_selesai' => '09:00:00',
            'periode_mulai' => 1,
            'periode_selesai' => null,
        ]);

        $this->expectException(RuntimeException::class);
        (new KalenderJamPelajaranResolver())->resolve($schedule, '2026-10-26');
    }
}
