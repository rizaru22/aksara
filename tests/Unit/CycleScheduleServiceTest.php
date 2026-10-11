<?php

namespace Tests\Unit;

use App\Services\CycleScheduleService;
use PHPUnit\Framework\TestCase;

class CycleScheduleServiceTest extends TestCase
{
    public function test_three_week_cycle_advances_and_wraps(): void
    {
        $service = new CycleScheduleService;

        self::assertSame(1, $service->getCurrentCycle('2026-07-13', '2026-07-13'));
        self::assertSame(2, $service->getCurrentCycle('2026-07-20', '2026-07-13'));
        self::assertSame(3, $service->getCurrentCycle('2026-07-27', '2026-07-13'));
        self::assertSame(1, $service->getCurrentCycle('2026-08-03', '2026-07-13'));
    }

    public function test_date_before_semester_start_uses_previous_cycle(): void
    {
        self::assertSame(3, (new CycleScheduleService)->getCurrentCycle('2026-07-06', '2026-07-13'));
    }
}
