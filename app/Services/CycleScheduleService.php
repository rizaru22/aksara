<?php
namespace App\Services;

use Carbon\Carbon;

class CycleScheduleService
{
    /**
     * Menghitung siklus minggu aktif (1, 2, atau 3) berdasarkan tanggal acuan awal semester.
     * 
     * @param string|Carbon|null $currentDate Tanggal yang ingin dicek
     * @param string|Carbon|null $semesterStartDate Tanggal Senin pertama acuan semester
     * @return int (1, 2, atau 3)
     */
    public function getCurrentCycle($currentDate = null, $semesterStartDate = null): int
    {
        $date = $currentDate ? Carbon::parse($currentDate) : Carbon::now();
        
        // Membaca acuan tanggal dari config/aksara.php
        $startDate = $semesterStartDate 
            ? Carbon::parse($semesterStartDate) 
            : Carbon::parse(config('aksara.academic.semester_start_date', '2026-07-13'));

        // Pastikan kalkulasi berbasis awal minggu (Senin)
        $startOfWeekSemester = $startDate->copy()->startOfWeek();
        $startOfWeekCurrent = $date->copy()->startOfWeek();

        // Hitung selisih minggu penuh
        $weeksDifference = (int) $startOfWeekSemester->diffInWeeks($startOfWeekCurrent, false);

        // Modulo 3 untuk memetakan ke Siklus 1, 2, atau 3
        return (($weeksDifference % 3) + 3) % 3 + 1;
    }

    /**
     * Mendapatkan nama hari dalam bahasa Indonesia untuk kueri jadwal.
     */
    public function getHariIndo($date = null): string
    {
        $carbonDate = $date ? Carbon::parse($date) : Carbon::now();
        
        $mapHari = [
            'Monday'    => 'Senin',
            'Tuesday'   => 'Selasa',
            'Wednesday' => 'Rabu',
            'Thursday'  => 'Kamis',
            'Friday'    => 'Jumat',
            'Saturday'  => 'Sabtu',
            'Sunday'    => 'Minggu',
        ];

        return $mapHari[$carbonDate->englishDayOfWeek] ?? 'Senin';
    }
}
