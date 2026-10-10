<?php
namespace App\Services;

use Carbon\Carbon;

class HaversineService
{
    /**
     * Menghitung jarak antara dua koordinat GPS dalam satuan Meter.
     * Menggunakan rumus Haversine.
     */
    public function calculateDistance(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $earthRadius = 6371000; // Radius bumi dalam Meter

        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);

        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLon / 2) * sin($dLon / 2);

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return round($earthRadius * $c, 2); // Jarak dalam meter
    }

    /**
     * Memeriksa apakah koordinat user berada di dalam Geofence Sekolah (mengambil data dari config/aksara.php).
     */
    public function isWithinSchoolGeofence(float $userLat, float $userLon): array
    {
        $schoolLat = config('aksara.geofence.latitude');
        $schoolLon = config('aksara.geofence.longitude');
        $maxRadius = config('aksara.geofence.radius_meters');

        $distance = $this->calculateDistance($userLat, $userLon, $schoolLat, $schoolLon);

        return [
            'is_within' => $distance <= $maxRadius,
            'distance_meters' => $distance,
            'max_allowed_radius' => $maxRadius,
        ];
    }

    /**
     * Memeriksa indikasi teleportasi (perubahan lokasi ekstrem dalam waktu singkat).
     */
    public function isTeleporting(float $prevLat, float $prevLon, string $prevTime, float $currLat, float $currLon, string $currTime, float $maxSpeedKmPerHour = 120.0): bool
    {
        $distanceMeters = $this->calculateDistance($prevLat, $prevLon, $currLat, $currLon);
        $distanceKm = $distanceMeters / 1000;

        $timePrevious = Carbon::parse($prevTime);
        $timeCurrent = Carbon::parse($currTime);
        $hoursDifference = $timePrevious->diffInMinutes($timeCurrent) / 60;

        if ($hoursDifference <= 0) {
            return $distanceMeters > 100; // Anomali jika waktu sama tapi beda >100m
        }

        $speed = $distanceKm / $hoursDifference;

        return $speed > $maxSpeedKmPerHour;
    }
}