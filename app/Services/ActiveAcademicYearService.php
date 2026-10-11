<?php

namespace App\Services;

use App\Models\Setting;
use App\Models\TahunAjaran;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ActiveAcademicYearService
{
    public function activate(int $yearId): TahunAjaran
    {
        return DB::transaction(function () use ($yearId): TahunAjaran {
            $years = TahunAjaran::query()->orderBy('id')->lockForUpdate()->get();
            $year = $years->firstWhere('id', $yearId);

            if (! $year) {
                throw ValidationException::withMessages(['tahun_ajaran_id' => 'Tahun ajaran tidak ditemukan.']);
            }

            TahunAjaran::query()->update(['is_active' => false]);
            $year->is_active = true;
            $year->save();

            Setting::put('active_tahun_ajaran', $year->tahun_ajaran, [
                'group' => 'academic',
                'type' => 'string',
                'label' => 'Tahun Ajaran Aktif',
                'description' => 'Disinkronkan dengan tahun_ajarans.is_active.',
            ]);

            return $year->refresh();
        });
    }

    /** @return array{consistent: bool, active_years: int, table_value: ?string, setting_value: ?string} */
    public function consistency(): array
    {
        $active = TahunAjaran::query()->where('is_active', true)->get();
        $setting = Setting::value('active_tahun_ajaran');
        $tableValue = $active->count() === 1 ? $active->first()->tahun_ajaran : null;

        return [
            'consistent' => $active->count() === 1 && $tableValue === $setting,
            'active_years' => $active->count(),
            'table_value' => $tableValue,
            'setting_value' => $setting,
        ];
    }

    public function repairFrom(string $source): TahunAjaran
    {
        return match ($source) {
            'settings' => $this->activate(
                TahunAjaran::query()->where('tahun_ajaran', Setting::value('active_tahun_ajaran'))->value('id')
                    ?? throw ValidationException::withMessages(['source' => 'Nilai settings.active_tahun_ajaran tidak cocok dengan data tahun ajaran.']),
            ),
            'table' => $this->repairFromTable(),
            default => throw ValidationException::withMessages(['source' => 'Sumber harus bernilai table atau settings.']),
        };
    }

    private function repairFromTable(): TahunAjaran
    {
        $active = TahunAjaran::query()->where('is_active', true)->get();

        if ($active->count() !== 1) {
            throw ValidationException::withMessages(['source' => 'Sumber table hanya dapat dipakai jika tepat satu tahun ajaran aktif.']);
        }

        return $this->activate($active->first()->id);
    }
}
