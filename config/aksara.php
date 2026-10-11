<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Geofence & Koordinat Sekolah
    |--------------------------------------------------------------------------
    */
    'geofence' => [
        'latitude' => env('SCHOOL_LATITUDE') !== null && env('SCHOOL_LATITUDE') !== '' ? (float) env('SCHOOL_LATITUDE') : null,
        'longitude' => env('SCHOOL_LONGITUDE') !== null && env('SCHOOL_LONGITUDE') !== '' ? (float) env('SCHOOL_LONGITUDE') : null,
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
