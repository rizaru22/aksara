<?php
namespace App\Services;

use App\Models\Setting;
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

        $c = 2 * atan2(sqrt($a), sqrt(max(0, 1 - $a)));

        return round($earthRadius * $c, 2); // Jarak dalam meter
    }

    /**
     * Memeriksa apakah koordinat user berada di dalam Geofence Sekolah (mengambil data dari config/aksara.php).
     */
    public function isWithinSchoolGeofence(float $userLat, float $userLon): array
    {
        $latitude = Setting::value('geofence_latitude', config('aksara.geofence.latitude'));
        $longitude = Setting::value('geofence_longitude', config('aksara.geofence.longitude'));
        if ($latitude === null || $longitude === null || ! filter_var(Setting::value('geofence_location_verified', false), FILTER_VALIDATE_BOOLEAN)) {
            throw new \RuntimeException('Lokasi sekolah belum diverifikasi.');
        }
        $schoolLat = (float) $latitude;
        $schoolLon = (float) $longitude;
        $maxRadius = (int) Setting::value('geofence_radius_meters', config('aksara.geofence.radius_meters'));

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
        $minutesDifference = $timePrevious->diffInMinutes($timeCurrent, false);

        if ($minutesDifference < 0) {
            return true;
        }
        if ($minutesDifference <= 0) {
            return $distanceMeters > 100;
        }

        $hoursDifference = $minutesDifference / 60;
        $speed = $distanceKm / $hoursDifference;

        return $speed > $maxSpeedKmPerHour;
    }
}
