<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')->updateOrInsert(
            ['key' => 'journal_gps_accuracy_meters'],
            [
                'group' => 'presensi',
                'type' => 'number',
                'label' => 'Batas Akurasi GPS Jurnal (Meter)',
                'description' => 'Akurasi GPS maksimum yang diterima untuk finalisasi jurnal mengajar.',
                'value' => env('JOURNAL_GPS_ACCURACY_METERS', env('ATTENDANCE_GPS_ACCURACY_METERS', 40)),
            ],
        );
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'journal_gps_accuracy_meters')->delete();
    }
};
