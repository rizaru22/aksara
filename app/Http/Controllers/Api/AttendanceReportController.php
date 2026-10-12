<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Absensi;
use App\Models\HariLibur;
use App\Models\PengajuanIzin;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;

class AttendanceReportController extends Controller
{
    /**
     * Endpoint GET /api/v1/reports/attendance/mine.
     * Menghasilkan laporan absensi personal per rentang tanggal agar guru dapat melihat status kehadiran dan izin secara historis.
     */
    public function mine(Request $request)
    {
        abort_unless($request->user()->can('absen-masuk') || $request->user()->can('absen-pulang'), 403);
        $filters = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);
        abort_if((strtotime($filters['to']) - strtotime($filters['from'])) > 366 * 86400, 422, 'Rentang laporan maksimal satu tahun.');

        $userId = $request->user()->id;
        $from = $filters['from'];
        $to = $filters['to'];
        $attendance = Absensi::query()->where('user_id', $userId)
            ->whereBetween('tanggal', [$from, $to])->get()->keyBy(fn (Absensi $item) => substr((string) $item->tanggal, 0, 10));
        $holidays = HariLibur::query()->whereBetween('tanggal', [$from, $to])->get()->keyBy(fn (HariLibur $item) => $item->tanggal->toDateString());
        $leaves = PengajuanIzin::query()->where('user_id', $userId)
            ->where('status_approval', 'APPROVED')
            ->whereDate('tanggal_mulai', '<=', $to)
            ->whereDate('tanggal_selesai', '>=', $from)
            ->orderByDesc('updated_at')->get();

        $rows = collect(CarbonPeriod::create($from, $to))->map(function ($date) use ($attendance, $holidays, $leaves): array {
            $key = $date->toDateString();
            $record = $attendance->get($key);
            $holiday = $holidays->get($key);
            if (! $holiday && $date->isSunday()) {
                $holiday = (object) ['nama' => 'Hari Minggu', 'jenis' => 'MINGGU'];
            }
            $leave = $leaves->first(fn (PengajuanIzin $item) => $item->tanggal_mulai <= $key && $item->tanggal_selesai >= $key);

            if ($holiday) {
                $status = 'LIBUR';
                $detail = $holiday->nama;
                $jenis = $holiday->jenis;
            } elseif ($record?->jam_masuk) {
                $status = match ($record->status_verifikasi_masuk) {
                    'VERIFIED', 'APPROVED' => 'HADIR',
                    'REJECTED' => 'DITOLAK',
                    default => 'MENUNGGU_VERIFIKASI',
                };
                $detail = null;
                $jenis = null;
            } elseif ($record && in_array($record->status_verifikasi_masuk, ['CUTI', 'DINAS_LUAR'], true)) {
                $status = $record->status_verifikasi_masuk === 'DINAS_LUAR' ? 'DINAS_LUAR' : 'IZIN_CUTI';
                $detail = $record->catatan_admin;
                $jenis = null;
            } elseif ($leave) {
                $status = $leave->jenis_pengajuan === 'DINAS'
                    ? 'DINAS_LUAR'
                    : (stripos($leave->alasan, 'sakit') !== false ? 'SAKIT' : 'IZIN_CUTI');
                $detail = $leave->alasan;
                $jenis = null;
            } else {
                $status = 'TIDAK_ADA_PRESENSI';
                $detail = null;
                $jenis = null;
            }

            return [
                'tanggal' => $key,
                'status' => $status,
                'jenis_libur' => $jenis,
                'detail' => $detail,
                'jam_masuk' => $record?->jam_masuk,
                'jam_pulang' => $record?->jam_pulang,
                'status_waktu_pulang' => $record?->status_waktu_pulang,
                'alasan_pulang' => $record?->alasan_pulang_awal,
                'presensi_pada_hari_libur' => (bool) ($holiday && $record?->jam_masuk),
            ];
        });

        return response()->json(['data' => $rows]);
    }
}
