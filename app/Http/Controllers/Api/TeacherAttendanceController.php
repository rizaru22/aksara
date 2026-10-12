<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Absensi;
use App\Models\HariLibur;
use App\Models\JadwalPresensiHarian;
use App\Models\PengajuanIzin;
use App\Models\Setting;
use App\Models\User;
use App\Services\HaversineService;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

class TeacherAttendanceController extends Controller
{
    private const DEFAULT_GPS_ACCURACY_METERS = 40;

    private function maxGpsAccuracyMeters(): int
    {
        return max(1, min(100, (int) Setting::value('attendance_gps_accuracy_meters', self::DEFAULT_GPS_ACCURACY_METERS)));
    }

    public function today(Request $request)
    {
        $now = now(config('app.timezone'));
        $attendance = Absensi::query()
            ->where('user_id', $request->user()->id)
            ->whereDate('tanggal', $now->toDateString())
            ->first();
        $approvedLeave = $this->approvedLeaveForDate($request->user(), $now);
        $holiday = $this->holidayForDate($now);
        if (! $holiday && $now->isSunday()) {
            $holiday = (object) ['nama' => 'Hari Minggu', 'jenis' => 'MINGGU'];
        }
        $checkInStart = $this->checkInStartAt($now);
        $checkInAvailable = ! $holiday
            && ! $approvedLeave
            && ! $attendance?->jam_masuk
            && $now->greaterThanOrEqualTo($checkInStart);

        return response()->json([
            'data' => $attendance,
            'approved_leave' => $approvedLeave ? [
                'tanggal_mulai' => $approvedLeave->tanggal_mulai,
                'tanggal_selesai' => $approvedLeave->tanggal_selesai,
            ] : null,
            'holiday' => $holiday,
            'check_in_available' => $checkInAvailable,
            'check_in_opens_at' => $checkInStart->format('H:i'),
            'check_in_seconds_until' => max(0, $checkInStart->getTimestamp() - $now->getTimestamp()),
            'gps_accuracy_limit_meters' => $this->maxGpsAccuracyMeters(),
        ]);
    }

    public function verifyLocation(Request $request, HaversineService $distance)
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['required', 'numeric', 'min:0', 'max:'.$this->maxGpsAccuracyMeters()],
            'action' => ['nullable', 'in:check-in,check-out'],
        ]);

        $now = now(config('app.timezone'));
        $action = $validated['action'] ?? 'check-in';
        if ($this->holidayForDate($now) || $now->isSunday()) {
            throw ValidationException::withMessages(['location' => 'Presensi dinonaktifkan hari ini karena merupakan hari libur.']);
        }
        $attendance = Absensi::query()->where('user_id', $request->user()->id)
            ->whereDate('tanggal', $now->toDateString())->first();
        if ($action === 'check-out' && (! $attendance?->jam_masuk || $attendance?->jam_pulang)) {
            throw ValidationException::withMessages(['attendance' => 'Absen pulang hanya tersedia setelah absen masuk tercatat dan sebelum absen pulang dilakukan.']);
        }
        if ($this->approvedLeaveForDate($request->user(), $now)
            && ($action === 'check-in' || ! $attendance?->jam_masuk)) {
            throw ValidationException::withMessages(['location' => 'Presensi dinonaktifkan karena izin/cuti Anda disetujui hari ini.']);
        }
        if ($action === 'check-in' && $now->lessThan($this->checkInStartAt($now))) {
            throw ValidationException::withMessages([
                'attendance' => 'Absen masuk baru dapat dilakukan mulai pukul '.$this->checkInStartAt($now)->format('H:i').'.',
            ]);
        }

        $geo = $this->geofence($distance, (float) $validated['latitude'], (float) $validated['longitude']);
        return response()->json([
            'within' => $geo['within'],
            'distance_meters' => $geo['distance'],
            'radius_meters' => $geo['radius'],
            'accuracy_meters' => (float) $validated['accuracy'],
        ]);
    }

    public function checkIn(Request $request, HaversineService $distance)
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['required', 'numeric', 'min:0', 'max:'.$this->maxGpsAccuracyMeters()],
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'liveness_type' => ['required', 'in:BLINK'],
        ]);

        $now = now(config('app.timezone'));
        $geo = $this->geofence($distance, (float) $validated['latitude'], (float) $validated['longitude']);
        if (! $geo['within']) {
            throw ValidationException::withMessages(['location' => 'Anda berada di luar radius geofence sekolah.']);
        }

        $path = $request->file('photo')?->store('attendance', 'local');
        try {
            $attendance = DB::transaction(function () use ($request, $validated, $geo, $now, $path): Absensi {
                $record = Absensi::query()
                    ->where('user_id', $request->user()->id)
                    ->whereDate('tanggal', $now->toDateString())
                    ->lockForUpdate()
                    ->first();

                if ($this->holidayForDate($now) || $now->isSunday()) {
                    $holiday = $this->holidayForDate($now);
                    throw ValidationException::withMessages([
                        'attendance' => 'Absen masuk dinonaktifkan karena hari ini merupakan '.($holiday?->nama ?? 'Hari Minggu').'.',
                    ]);
                }

                if ($this->approvedLeaveForDate($request->user(), $now)) {
                    throw ValidationException::withMessages([
                        'attendance' => 'Absen masuk dinonaktifkan karena izin/cuti Anda sudah disetujui untuk hari ini.',
                    ]);
                }

                if ($record?->jam_masuk) {
                    throw ValidationException::withMessages(['attendance' => 'Presensi masuk hari ini sudah tercatat.']);
                }

                $schedule = JadwalPresensiHarian::query()->where('hari', $this->hariPresensi($now))->first();
                $checkInStart = $this->checkInStartAt($now, $schedule);
                if ($now->lessThan($checkInStart)) {
                    throw ValidationException::withMessages([
                        'attendance' => 'Absen masuk untuk hari ini baru dibuka pukul '.$checkInStart->format('H:i').'.',
                    ]);
                }
                $deadline = $schedule?->jam_masuk_akhir ?? Setting::value('jam_masuk_batas', '07:15:00');
                $deadlineAt = Carbon::parse($now->toDateString().' '.$deadline, config('app.timezone'));
                $lateMinutes = $now->greaterThan($deadlineAt) ? (int) $deadlineAt->diffInMinutes($now) : 0;
                $record ??= new Absensi(['user_id' => $request->user()->id, 'tanggal' => $now->toDateString()]);
                $record->fill([
                    'jam_masuk' => $now->format('H:i:s'),
                    'foto_masuk' => $path,
                    'lat_masuk' => $validated['latitude'],
                    'long_masuk' => $validated['longitude'],
                    'distance_masuk' => $geo['distance'],
                    'gps_accuracy_masuk' => $validated['accuracy'],
                    'liveness_type_masuk' => $validated['liveness_type'],
                    'status_verifikasi_masuk' => $geo['within'] ? 'VERIFIED' : 'FLAGGED',
                    'keterlambatan_menit' => $lateMinutes,
                ])->save();
                $record->livenessLogs()->create([
                    'gesture_type' => strtolower($validated['liveness_type']),
                    'is_passed' => true,
                ]);

                return $record->refresh();
            });
        } catch (QueryException $exception) {
            if ($path) Storage::disk('local')->delete($path);
            throw ValidationException::withMessages(['attendance' => 'Presensi masuk sudah tercatat untuk hari ini.']);
        } catch (\Throwable $exception) {
            if ($path) Storage::disk('local')->delete($path);
            throw $exception;
        }

        return response()->json(['message' => 'Presensi masuk berhasil dicatat.', 'data' => $attendance], 201);
    }

    public function checkOut(Request $request, HaversineService $distance)
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['required', 'numeric', 'min:0', 'max:'.$this->maxGpsAccuracyMeters()],
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'liveness_type' => ['required', 'in:BLINK'],
            'reason' => ['nullable', 'string', 'max:2000'],
        ]);

        $now = now(config('app.timezone'));
        $geo = $this->geofence($distance, (float) $validated['latitude'], (float) $validated['longitude']);
        if (! $geo['within']) {
            throw ValidationException::withMessages(['location' => 'Anda berada di luar radius geofence sekolah.']);
        }

        $path = $request->file('photo')?->store('attendance', 'local');
        try {
            $attendance = DB::transaction(function () use ($request, $validated, $geo, $now, $path): Absensi {
                $record = Absensi::query()
                    ->where('user_id', $request->user()->id)
                    ->whereDate('tanggal', $now->toDateString())
                    ->lockForUpdate()
                    ->first();

                if (($holiday = $this->holidayForDate($now)) || $now->isSunday()) {
                    throw ValidationException::withMessages([
                        'attendance' => 'Absen pulang dinonaktifkan karena hari ini merupakan '.($holiday?->nama ?? 'Hari Minggu').'.',
                    ]);
                }
                if ($this->approvedLeaveForDate($request->user(), $now) && ! $record?->jam_masuk) {
                    throw ValidationException::withMessages([
                        'attendance' => 'Absen pulang dinonaktifkan karena izin/cuti Anda sudah disetujui untuk hari ini.',
                    ]);
                }
                if (! $record?->jam_masuk) {
                    throw ValidationException::withMessages(['attendance' => 'Presensi masuk harus tercatat sebelum presensi pulang.']);
                }
                // If the leave was approved after the teacher had checked in, allow checkout
                // to finish the existing attendance record and avoid leaving it incomplete.
                if ($record->jam_pulang) {
                    throw ValidationException::withMessages(['attendance' => 'Presensi pulang hari ini sudah tercatat.']);
                }

                $schedule = JadwalPresensiHarian::query()->where('hari', $this->hariPresensi($now))->first();
                $checkoutStatus = 'TEPAT_WAKTU';
                if ($schedule?->jam_pulang_mulai) {
                    $checkoutStart = Carbon::parse($now->toDateString().' '.$schedule->jam_pulang_mulai, config('app.timezone'));
                    if ($now->lessThan($checkoutStart)) {
                        $checkoutStatus = 'PULANG_AWAL';
                    }
                }
                if ($schedule?->jam_pulang_akhir) {
                    $checkoutEnd = Carbon::parse($now->toDateString().' '.$schedule->jam_pulang_akhir, config('app.timezone'));
                    if ($now->greaterThan($checkoutEnd)) $checkoutStatus = 'DI_LUAR_JADWAL';
                }
                if ($checkoutStatus !== 'TEPAT_WAKTU' && blank($validated['reason'] ?? null)) {
                    $boundary = $checkoutStatus === 'PULANG_AWAL' ? $schedule->jam_pulang_mulai : $schedule->jam_pulang_akhir;
                    $ruleName = $checkoutStatus === 'PULANG_AWAL' ? 'sebelum' : 'setelah';
                    throw ValidationException::withMessages([
                        'reason' => 'Absen pulang '.$ruleName.' pukul '.substr($boundary, 0, 5).' wajib disertai alasan.',
                    ]);
                }

                $record->fill([
                    'jam_pulang' => $now->format('H:i:s'),
                    'foto_pulang' => $path,
                    'lat_pulang' => $validated['latitude'],
                    'long_pulang' => $validated['longitude'],
                    'distance_pulang' => $geo['distance'],
                    'gps_accuracy_pulang' => $validated['accuracy'],
                    'liveness_type_pulang' => $validated['liveness_type'],
                    'status_verifikasi_pulang' => 'VERIFIED',
                    'status_waktu_pulang' => $checkoutStatus,
                    'alasan_pulang_awal' => $validated['reason'] ?? null,
                ])->save();
                $record->livenessLogs()->create([
                    'session' => 'check-out',
                    'gesture_type' => strtolower($validated['liveness_type']),
                    'is_passed' => true,
                ]);

                return $record->refresh();
            });
        } catch (\Throwable $exception) {
            if ($path) Storage::disk('local')->delete($path);
            throw $exception;
        }

        return response()->json(['message' => 'Presensi pulang berhasil dicatat.', 'data' => $attendance]);
    }

    public function flagged()
    {
        $items = Absensi::query()
            ->with('user:id,nama,nip,email')
            ->where(fn ($query) => $query->where('status_verifikasi_masuk', 'FLAGGED')->orWhere('status_verifikasi_pulang', 'FLAGGED'))
            ->latest('tanggal')
            ->paginate(20);

        return response()->json($items);
    }

    public function review(Request $request, Absensi $absensi)
    {
        $data = $request->validate([
            'session' => ['required', 'in:masuk,pulang'],
            'decision' => ['required', 'in:APPROVED,REJECTED'],
            'note' => ['required', 'string', 'max:2000'],
        ]);

        $column = $data['session'] === 'masuk' ? 'status_verifikasi_masuk' : 'status_verifikasi_pulang';
        if ($absensi->{$column} !== 'FLAGGED') {
            throw ValidationException::withMessages(['decision' => 'Hanya presensi berstatus FLAGGED yang dapat ditinjau.']);
        }

        $absensi->forceFill([
            $column => $data['decision'],
            'catatan_admin' => $data['note'],
            'approved_by' => $request->user()->id,
        ])->save();

        return response()->json(['message' => 'Tinjauan presensi tersimpan.', 'data' => $absensi->refresh()]);
    }

    public function photo(Request $request, Absensi $absensi, string $session)
    {
        abort_unless(in_array($session, ['masuk', 'pulang'], true), 404);
        $path = $absensi->{'foto_'.$session};
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->download($path);
    }

    private function hariPresensi(Carbon $date): string
    {
        return [
            1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu', 4 => 'Kamis',
            5 => 'Jumat', 6 => 'Sabtu', 7 => 'Minggu',
        ][$date->dayOfWeekIso];
    }

    private function checkInStartAt(Carbon $date, ?JadwalPresensiHarian $schedule = null): Carbon
    {
        $schedule ??= JadwalPresensiHarian::query()->where('hari', $this->hariPresensi($date))->first();
        $startTime = $schedule?->jam_masuk_mulai ?: '07:00';

        return Carbon::parse($date->toDateString().' '.$startTime, config('app.timezone'));
    }

    private function approvedLeaveForDate(User $user, Carbon $date): ?PengajuanIzin
    {
        return PengajuanIzin::query()
            ->where('user_id', $user->id)
            ->where('jenis_pengajuan', 'CUTI')
            ->where('status_approval', 'APPROVED')
            ->whereDate('tanggal_mulai', '<=', $date->toDateString())
            ->whereDate('tanggal_selesai', '>=', $date->toDateString())
            ->latest('updated_at')
            ->first();
    }

    private function holidayForDate(Carbon $date): ?HariLibur
    {
        return HariLibur::query()->whereDate('tanggal', $date->toDateString())->first();
    }

    private function geofence(HaversineService $distance, float $latitude, float $longitude): array
    {
        $verified = filter_var(Setting::value('geofence_location_verified', false), FILTER_VALIDATE_BOOLEAN);
        $latitudeSetting = Setting::value('geofence_latitude', config('aksara.geofence.latitude'));
        $longitudeSetting = Setting::value('geofence_longitude', config('aksara.geofence.longitude'));
        if (! $verified || $latitudeSetting === null || $longitudeSetting === null) {
            throw new ServiceUnavailableHttpException(null, 'Lokasi sekolah belum diverifikasi oleh Admin.');
        }
        $schoolLatitude = (float) $latitudeSetting;
        $schoolLongitude = (float) $longitudeSetting;
        $radius = (int) Setting::value('geofence_radius_meters', config('aksara.geofence.radius_meters'));
        $meters = $distance->calculateDistance($latitude, $longitude, $schoolLatitude, $schoolLongitude);
        $within = $meters <= $radius;
        $strict = filter_var(Setting::value('is_geofence_strict', false), FILTER_VALIDATE_BOOLEAN);

        return ['distance' => $meters, 'within' => $within, 'radius' => $radius, 'accepted' => $within || ! $strict];
    }
}
