<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Services\ActiveAcademicYearService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ActiveAcademicYearServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_activation_updates_table_and_setting_in_one_consistent_state(): void
    {
        $first = TahunAjaran::query()->create(['tahun_ajaran' => '2025/2026', 'is_active' => true]);
        $second = TahunAjaran::query()->create(['tahun_ajaran' => '2026/2027', 'is_active' => false]);
        Setting::query()->create(['key' => 'active_tahun_ajaran', 'value' => '2025/2026', 'group' => 'academic', 'type' => 'string', 'label' => 'Tahun aktif']);

        $active = app(ActiveAcademicYearService::class)->activate($second->id);

        self::assertSame($second->id, $active->id);
        self::assertDatabaseHas('tahun_ajarans', ['id' => $first->id, 'is_active' => 0]);
        self::assertDatabaseHas('tahun_ajarans', ['id' => $second->id, 'is_active' => 1]);
        self::assertSame('2026/2027', Setting::value('active_tahun_ajaran'));
        self::assertTrue(app(ActiveAcademicYearService::class)->consistency()['consistent']);
    }
}
