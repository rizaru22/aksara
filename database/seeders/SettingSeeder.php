<?php

namespace Database\Seeders;

use App\Models\Setting;
use App\Models\TahunAjaran;
use App\Services\ActiveAcademicYearService;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(): void
    {
        $settings = [
            // --- GEOFENCE & KEAMANAN ---
            [
                'key'         => 'geofence_latitude',
                'value'       => null,
                'group'       => 'geofence',
                'type'        => 'number',
                'label'       => 'Latitude Sekolah',
                'description' => 'Titik koordinat lintang lokasi sekolah',
            ],
            [
                'key'         => 'geofence_longitude',
                'value'       => null,
                'group'       => 'geofence',
                'type'        => 'number',
                'label'       => 'Longitude Sekolah',
                'description' => 'Titik koordinat bujur lokasi sekolah',
            ],
            [
                'key'         => 'geofence_location_verified',
                'value'       => '0',
                'group'       => 'geofence',
                'type'        => 'boolean',
                'label'       => 'Lokasi Geofence Terverifikasi',
                'description' => 'Aktifkan hanya setelah koordinat sekolah dikonfirmasi.',
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
            [
                'key'         => 'attendance_gps_accuracy_meters',
                'value'       => '40',
                'group'       => 'presensi',
                'type'        => 'number',
                'label'       => 'Batas Akurasi GPS Presensi (Meter)',
                'description' => 'Akurasi GPS maksimum yang diterima untuk presensi masuk dan pulang.',
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
            if ($setting['key'] === 'active_tahun_ajaran') {
                continue;
            }
            Setting::firstOrCreate(['key' => $setting['key']], array_diff_key($setting, ['key' => true]));
        }

        if (! TahunAjaran::query()->where('is_active', true)->exists()) {
            $yearLabel = Setting::value('active_tahun_ajaran', '2026/2027');
            $year = TahunAjaran::query()->firstOrCreate(['tahun_ajaran' => $yearLabel]);
            app(ActiveAcademicYearService::class)->activate($year->id);
        } else {
            $active = TahunAjaran::query()->where('is_active', true)->first();
            if (TahunAjaran::query()->where('is_active', true)->count() === 1) {
                Setting::put('active_tahun_ajaran', $active->tahun_ajaran, [
                    'group' => 'academic', 'type' => 'string', 'label' => 'Tahun Ajaran Aktif',
                    'description' => 'Disinkronkan dengan tahun_ajarans.is_active.',
                ]);
            }
        }
    }
}
