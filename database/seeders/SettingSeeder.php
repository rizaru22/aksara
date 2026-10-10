<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(): void
    {
        $settings = [
            // --- GEOFENCE & KEAMANAN ---
            [
                'key'         => 'geofence_latitude',
                'value'       => '-6.200000',
                'group'       => 'geofence',
                'type'        => 'number',
                'label'       => 'Latitude Sekolah',
                'description' => 'Titik koordinat lintang lokasi sekolah',
            ],
            [
                'key'         => 'geofence_longitude',
                'value'       => '106.816666',
                'group'       => 'geofence',
                'type'        => 'number',
                'label'       => 'Longitude Sekolah',
                'description' => 'Titik koordinat bujur lokasi sekolah',
            ],
            [
                'key'         => 'geofence_radius_meters',
                'value'       => '100',
                'group'       => 'geofence',
                'type'        => 'number',
                'label'       => 'Radius Geofence (Meter)',
                'description' => 'Batas jarak maksimum toleransi absensi dari titik sekolah',
            ],
            [
                'key'         => 'is_geofence_strict',
                'value'       => '0', // 0 = False (flagged), 1 = True (reject)
                'group'       => 'geofence',
                'type'        => 'boolean',
                'label'       => 'Mode Strict Geofence',
                'description' => 'Jika aktif, absensi di luar radius langsung ditolak sistem',
            ],

            // --- AKADEMIK & SIKLUS ---
            [
                'key'         => 'semester_start_date',
                'value'       => '2026-07-13',
                'group'       => 'academic',
                'type'        => 'date',
                'label'       => 'Tanggal Awal Semester',
                'description' => 'Tanggal Senin pertama semester sebagai acuan Siklus 3-Mingguan',
            ],
            [
                'key'         => 'active_tahun_ajaran',
                'value'       => '2026/2027',
                'group'       => 'academic',
                'type'        => 'string',
                'label'       => 'Tahun Ajaran Aktif',
                'description' => 'Tahun ajaran yang sedang berjalan',
            ],

            // --- JAM ABSENSI ---
            [
                'key'         => 'jam_masuk_batas',
                'value'       => '07:15:00',
                'group'       => 'presensi',
                'type'        => 'time',
                'label'       => 'Batas Jam Masuk (Terlambat)',
                'description' => 'Absensi masuk lewat dari jam ini akan tercatat Terlambat',
            ],

            // --- IDENTITAS SEKOLAH ---
            [
                'key'         => 'school_name',
                'value'       => 'SMA AKSARA',
                'group'       => 'school_info',
                'type'        => 'string',
                'label'       => 'Nama Sekolah',
                'description' => 'Nama resmi instansi sekolah untuk cetak laporan',
            ],
        ];

        foreach ($settings as $setting) {
            Setting::updateOrCreate(['key' => $setting['key']], $setting);
        }
    }
}