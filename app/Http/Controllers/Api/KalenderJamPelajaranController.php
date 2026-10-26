<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KalenderJamPelajaran;
use App\Models\KalenderJamPelajaranDetail;
use App\Services\KalenderJamPelajaranService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class KalenderJamPelajaranController extends Controller
{
    private const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    public function index()
    {
        return response()->json([
            'data' => KalenderJamPelajaran::query()
                ->with('detailPeriode')
                ->orderByDesc('status')
                ->orderBy('nama')
                ->get(),
        ]);
    }

    public function active()
    {
        $calendar = KalenderJamPelajaran::query()
            ->where('status', KalenderJamPelajaran::STATUS_AKTIF)
            ->with('detailPeriode')
            ->first();

        return response()->json(['data' => $calendar]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nama' => ['required', 'string', 'max:100'],
            'catatan' => ['nullable', 'string'],
        ]);

        $calendar = KalenderJamPelajaran::query()->create([
            ...$data,
            'status' => KalenderJamPelajaran::STATUS_NONAKTIF,
            'dibuat_oleh' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Kalender jam pelajaran berhasil dibuat. Tambahkan periode sebelum mengaktifkan.',
            'data' => $calendar->load('detailPeriode'),
        ], 201);
    }

    public function show(KalenderJamPelajaran $calendar)
    {
        return response()->json(['data' => $calendar->load('detailPeriode')]);
    }

    public function update(Request $request, KalenderJamPelajaran $calendar)
    {
        if ($calendar->status === KalenderJamPelajaran::STATUS_AKTIF) {
            throw ValidationException::withMessages([
                'calendar' => 'Nonaktifkan kalender sebelum mengubah identitas atau detail periodenya.',
            ]);
        }

        $data = $request->validate([
            'nama' => ['sometimes', 'required', 'string', 'max:100'],
            'catatan' => ['sometimes', 'nullable', 'string'],
        ]);
        $calendar->fill($data)->save();

        return response()->json([
            'message' => 'Kalender berhasil diperbarui.',
            'data' => $calendar->load('detailPeriode'),
        ]);
    }

    public function savePeriods(Request $request, KalenderJamPelajaran $calendar)
    {
        if ($calendar->status === KalenderJamPelajaran::STATUS_AKTIF) {
            throw ValidationException::withMessages([
                'periods' => 'Nonaktifkan kalender sebelum mengubah periode agar sesi berjalan tidak berubah mendadak.',
            ]);
        }

        $validated = $request->validate([
            'periods' => ['required', 'array', 'min:1'],
            'periods.*.hari' => ['required', 'in:Senin,Selasa,Rabu,Kamis,Jumat,Sabtu'],
            'periods.*.nomor_periode' => ['required', 'integer', 'min:1', 'max:30'],
            'periods.*.jam_mulai' => ['required', 'date_format:H:i'],
            'periods.*.jam_selesai' => ['required', 'date_format:H:i', 'after:periods.*.jam_mulai'],
            'periods.*.label' => ['nullable', 'string', 'max:50'],
        ]);

        $groups = collect($validated['periods'])->groupBy('hari');
        foreach ($groups as $day => $rows) {
            $numbers = $rows->pluck('nomor_periode')->map(fn ($n) => (int) $n)->sort()->values();
            if ($numbers->unique()->count() !== $numbers->count()) {
                throw ValidationException::withMessages(['periods' => "Nomor periode hari {$day} tidak boleh duplikat."]);
            }
            if ($numbers->all() !== range(1, $numbers->count())) {
                throw ValidationException::withMessages(['periods' => "Nomor periode hari {$day} harus berurutan mulai dari 1."]);
            }
            $sorted = $rows->sortBy('nomor_periode')->values();
            for ($i = 1; $i < $sorted->count(); $i++) {
                if ($sorted[$i - 1]['jam_mulai'] >= $sorted[$i]['jam_mulai']) {
                    throw ValidationException::withMessages(['periods' => "Urutan periode hari {$day} harus mengikuti urutan waktu."]);
                }
                if ($sorted[$i - 1]['jam_selesai'] > $sorted[$i]['jam_mulai']) {
                    throw ValidationException::withMessages(['periods' => "Periode hari {$day} tidak boleh saling bertumpang tindih."]);
                }
            }
        }

        DB::transaction(function () use ($calendar, $validated): void {
            $calendar->detailPeriode()->delete();
            foreach ($validated['periods'] as $period) {
                $calendar->detailPeriode()->create([
                    ...$period,
                    'jam_mulai' => $period['jam_mulai'].':00',
                    'jam_selesai' => $period['jam_selesai'].':00',
                ]);
            }
        });

        return response()->json([
            'message' => 'Periode kalender berhasil disimpan.',
            'data' => $calendar->fresh()->load('detailPeriode'),
        ]);
    }

    public function activate(KalenderJamPelajaran $calendar, KalenderJamPelajaranService $service)
    {
        try {
            $active = $service->activate((int) $calendar->id);
        } catch (RuntimeException $exception) {
            throw ValidationException::withMessages(['calendar' => $exception->getMessage()]);
        }

        return response()->json([
            'message' => 'Kalender jam pelajaran berhasil diaktifkan.',
            'data' => $active->load('detailPeriode'),
        ]);
    }

    public function deactivate(KalenderJamPelajaran $calendar)
    {
        DB::transaction(function () use ($calendar): void {
            $locked = KalenderJamPelajaran::query()->whereKey($calendar->id)->lockForUpdate()->firstOrFail();
            $locked->status = KalenderJamPelajaran::STATUS_NONAKTIF;
            $locked->save();
        });

        return response()->json([
            'message' => 'Kalender jam pelajaran dinonaktifkan. Jadwal berbasis periode memerlukan kalender aktif untuk resolusi waktu.',
            'data' => $calendar->fresh()->load('detailPeriode'),
        ]);
    }
}
