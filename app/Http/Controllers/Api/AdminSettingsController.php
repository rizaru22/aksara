<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JadwalPresensiHarian;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminSettingsController extends Controller
{
    private const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    private const DEFAULT_DAILY_SCHEDULE = [
        'jam_masuk_mulai' => '07:00',
        'jam_masuk_akhir' => '07:45',
        'jam_pulang_mulai' => '11:00',
        'jam_pulang_akhir' => '14:30',
    ];

    private const EDITABLE = [
        'geofence_latitude' => ['group' => 'geofence', 'type' => 'number', 'label' => 'Latitude Sekolah'],
        'geofence_longitude' => ['group' => 'geofence', 'type' => 'number', 'label' => 'Longitude Sekolah'],
        'geofence_radius_meters' => ['group' => 'geofence', 'type' => 'number', 'label' => 'Radius Geofence (Meter)'],
        'attendance_gps_accuracy_meters' => ['group' => 'presensi', 'type' => 'number', 'label' => 'Batas Akurasi GPS Presensi (Meter)'],
        'geofence_location_verified' => ['group' => 'geofence', 'type' => 'boolean', 'label' => 'Lokasi Geofence Terverifikasi'],
        'is_geofence_strict' => ['group' => 'geofence', 'type' => 'boolean', 'label' => 'Mode Strict Geofence'],
        'semester_start_date' => ['group' => 'academic', 'type' => 'date', 'label' => 'Tanggal Awal Semester'],
        'active_semester' => ['group' => 'academic', 'type' => 'string', 'label' => 'Semester Aktif'],
        'jam_masuk_batas' => ['group' => 'presensi', 'type' => 'time', 'label' => 'Batas Jam Masuk'],
        'school_name' => ['group' => 'school_info', 'type' => 'string', 'label' => 'Nama Sekolah'],
    ];

    public function index(Request $request)
    {
        abort_unless($request->user()->hasRole('admin'), 403);

        $dailySchedules = JadwalPresensiHarian::query()->get()->keyBy('hari');
        $attendanceSchedule = collect(self::DAYS)->map(fn (string $day): array => [
            'hari' => $day,
            'jam_masuk_mulai' => substr($dailySchedules->get($day)?->jam_masuk_mulai ?: self::DEFAULT_DAILY_SCHEDULE['jam_masuk_mulai'], 0, 5),
            'jam_masuk_akhir' => substr($dailySchedules->get($day)?->jam_masuk_akhir ?: self::DEFAULT_DAILY_SCHEDULE['jam_masuk_akhir'], 0, 5),
            'jam_pulang_mulai' => substr($dailySchedules->get($day)?->jam_pulang_mulai ?: self::DEFAULT_DAILY_SCHEDULE['jam_pulang_mulai'], 0, 5),
            'jam_pulang_akhir' => substr($dailySchedules->get($day)?->jam_pulang_akhir ?: self::DEFAULT_DAILY_SCHEDULE['jam_pulang_akhir'], 0, 5),
        ])->values();

        return response()->json([
            'data' => Setting::query()->whereIn('key', array_keys(self::EDITABLE))->orderBy('group')->get(),
            'attendance_schedule' => $attendanceSchedule,
        ]);
    }

    public function update(Request $request)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        $rules = [
            'settings' => ['required', 'array', 'min:1'],
            'settings.geofence_latitude' => ['sometimes', 'numeric', 'between:-90,90'],
            'settings.geofence_longitude' => ['sometimes', 'numeric', 'between:-180,180'],
            'settings.geofence_radius_meters' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'settings.attendance_gps_accuracy_meters' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'settings.confirm_geofence_location' => ['sometimes', 'boolean'],
            'settings.is_geofence_strict' => ['sometimes', 'boolean'],
            'settings.semester_start_date' => ['sometimes', 'date'],
            'settings.active_semester' => ['sometimes', 'in:Ganjil,Genap'],
            'settings.jam_masuk_batas' => ['sometimes', 'date_format:H:i,H:i:s'],
            'settings.school_name' => ['sometimes', 'string', 'max:255'],
            'settings.attendance_schedule' => ['sometimes', 'array', 'min:1'],
            'settings.attendance_schedule.*.hari' => ['required', 'distinct', Rule::in(self::DAYS)],
            'settings.attendance_schedule.*.jam_masuk_mulai' => ['nullable', 'date_format:H:i,H:i:s'],
            'settings.attendance_schedule.*.jam_masuk_akhir' => ['required', 'date_format:H:i,H:i:s'],
            'settings.attendance_schedule.*.jam_pulang_mulai' => ['nullable', 'date_format:H:i,H:i:s'],
            'settings.attendance_schedule.*.jam_pulang_akhir' => ['nullable', 'date_format:H:i,H:i:s'],
        ];
        $data = $request->validate($rules);
        foreach ($data['settings']['attendance_schedule'] ?? [] as $schedule) {
            if (! empty($schedule['jam_masuk_mulai']) && $schedule['jam_masuk_mulai'] > $schedule['jam_masuk_akhir']) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'settings.attendance_schedule' => "Jam awal masuk {$schedule['hari']} harus sebelum atau sama dengan batas masuk.",
                ]);
            }
            if (! empty($schedule['jam_pulang_mulai']) && ! empty($schedule['jam_pulang_akhir'])
                && $schedule['jam_pulang_mulai'] > $schedule['jam_pulang_akhir']) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'settings.attendance_schedule' => "Jam mulai pulang {$schedule['hari']} harus sebelum atau sama dengan batas akhir pulang.",
                ]);
            }
        }
        if (isset($data['settings']['jam_masuk_batas'])) {
            $data['settings']['jam_masuk_batas'] = substr($data['settings']['jam_masuk_batas'], 0, 5);
        }

        DB::transaction(function () use ($data): void {
            foreach ($data['settings'] as $key => $value) {
                if (in_array($key, ['confirm_geofence_location', 'attendance_schedule'], true)) continue;
                if ($key === 'geofence_location_verified') abort(422, 'Status verifikasi lokasi hanya dapat diubah melalui konfirmasi eksplisit.');
                $metadata = self::EDITABLE[$key] ?? abort(422, "Pengaturan {$key} tidak dapat diubah.");
                Setting::put($key, is_bool($value) ? (int) $value : $value, [
                    ...$metadata,
                    'description' => 'Diperbarui melalui panel pengaturan Admin.',
                ]);
            }

            foreach ($data['settings']['attendance_schedule'] ?? [] as $schedule) {
                JadwalPresensiHarian::query()->updateOrCreate(
                    ['hari' => $schedule['hari']],
                    [
                        'jam_masuk_mulai' => isset($schedule['jam_masuk_mulai'])
                            ? substr($schedule['jam_masuk_mulai'], 0, 5)
                            : null,
                        'jam_masuk_akhir' => substr($schedule['jam_masuk_akhir'], 0, 5),
                        'jam_pulang_mulai' => isset($schedule['jam_pulang_mulai'])
                            ? substr($schedule['jam_pulang_mulai'], 0, 5)
                            : null,
                        'jam_pulang_akhir' => isset($schedule['jam_pulang_akhir'])
                            ? substr($schedule['jam_pulang_akhir'], 0, 5)
                            : null,
                    ],
                );
            }

            JadwalPresensiHarian::query()->where('hari', 'Minggu')->delete();

            $values = $data['settings'];
            $oldLatitude = Setting::value('geofence_latitude');
            $oldLongitude = Setting::value('geofence_longitude');
            $coordinatesChanged = (string) ($values['geofence_latitude'] ?? $oldLatitude) !== (string) $oldLatitude
                || (string) ($values['geofence_longitude'] ?? $oldLongitude) !== (string) $oldLongitude;
            if ($coordinatesChanged || filter_var($values['confirm_geofence_location'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                Setting::put('geofence_location_verified', filter_var($values['confirm_geofence_location'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0, [
                    'group' => 'geofence', 'type' => 'boolean', 'label' => 'Lokasi Geofence Terverifikasi',
                    'description' => 'Hanya aktif setelah Admin mengonfirmasi koordinat sekolah.',
                ]);
            }
        });

        return response()->json(['message' => 'Pengaturan berhasil diperbarui.', 'data' => Setting::query()->whereIn('key', array_keys(self::EDITABLE))->get()]);
    }
}
