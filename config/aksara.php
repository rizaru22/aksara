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

    /*
    |--------------------------------------------------------------------------
    | Interval pengingat push reminder
    |--------------------------------------------------------------------------
    */
    'push_reminders' => [
        'interval_minutes' => max(1, (int) env('PUSH_REMINDER_INTERVAL_MINUTES', 15)),
        'check_in_end_time' => env('PUSH_REMINDER_CHECK_IN_END_TIME', '18:00:00'),
        'check_out_end_time' => env('PUSH_REMINDER_CHECK_OUT_END_TIME', '18:00:00'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Batas akurasi GPS per fitur
    |--------------------------------------------------------------------------
    */
    'gps_accuracy' => [
        'attendance_meters' => (int) env('ATTENDANCE_GPS_ACCURACY_METERS', 40),
        'journal_meters' => (int) env('JOURNAL_GPS_ACCURACY_METERS', env('ATTENDANCE_GPS_ACCURACY_METERS', 40)),
    ],
];
