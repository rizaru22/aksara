<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')->insertOrIgnore([
            [
                'key' => 'attendance_gps_accuracy_meters',
                'value' => '40',
                'group' => 'presensi',
                'type' => 'number',
                'label' => 'Batas Akurasi GPS Presensi (Meter)',
                'description' => 'Akurasi GPS maksimum yang diterima untuk presensi masuk dan pulang.',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'attendance_gps_accuracy_meters')->delete();
    }
};
