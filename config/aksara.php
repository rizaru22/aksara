<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Geofence & Koordinat Sekolah
    |--------------------------------------------------------------------------
    */
    'geofence' => [
        'latitude' => (float) env('SCHOOL_LATITUDE', -6.200000),
        'longitude' => (float) env('SCHOOL_LONGITUDE', 106.816666),
        'radius_meters' => (int) env('SCHOOL_RADIUS_METERS', 100),
    ],

    /*
    |--------------------------------------------------------------------------
    | Konfigurasi Akademik & Siklus 3-Mingguan
    |--------------------------------------------------------------------------
    */
    'academic' => [
        'semester_start_date' => env('SEMESTER_START_DATE', '2026-07-13'),
    ],
]; 