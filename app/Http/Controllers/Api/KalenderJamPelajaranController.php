<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KalenderJamPelajaran;
use App\Models\KalenderJamPelajaranDetail;
use App\Services\KalenderJamPelajaranService;
use App\Services\SimpleXlsx;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class KalenderJamPelajaranController extends Controller
{
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

    public function periodsTemplate(SimpleXlsx $xlsx)
    {
        if (! class_exists(\\ZipArchive::class)) {
            return response()->json(['message' => 'Aktifkan ekstensi PHP zip untuk membuat template Excel.'], 503);
        }

        $content = $xlsx->write(['hari', 'nomor_periode', 'jam_mulai', 'jam_selesai', 'label'], 'Detail_Kalender');
        return response($content, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="template_detail_kalender.xlsx"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function importPeriods(Request $request, KalenderJamPelajaran $calendar, SimpleXlsx $xlsx)
    {
        if ($calendar->status === KalenderJamPelajaran::STATUS_AKTIF) {
            throw ValidationException::withMessages([
                'file' => 'Nonaktifkan kalender sebelum mengimpor detail periode.',
            ]);
        }

        $request->validate(['file' => 'required|file|mimes:xlsx|max:10240']);
        if (! class_exists(\\ZipArchive::class)) {
            return response()->json(['message' => 'Aktifkan ekstensi PHP zip untuk mengimpor file Excel.'], 503);
        }

        $rows = $xlsx->read($request->file('file')->getRealPath());
        if (count($rows) > 2000) {
            throw ValidationException::withMessages(['file' => 'Maksimum 2.000 baris data per impor.']);
        }

        $expected = ['hari', 'nomor_periode', 'jam_mulai', 'jam_selesai', 'label'];
        $missing = array_values(array_diff($expected, array_keys($rows[0] ?? [])));
        if ($missing) {
            throw ValidationException::withMessages(['file' => 'Kolom template tidak lengkap: '.implode(', ', $missing).'. Unduh template terbaru.']);
        }

        $periods = [];
        foreach ($rows as $index => $row) {
            $line = $index + 2;
            $start = $this->excelTimeValue((string) ($row['jam_mulai'] ?? ''));
            $end = $this->excelTimeValue((string) ($row['jam_selesai'] ?? ''));
            $periods[] = [
                'hari' => ucfirst(strtolower(trim((string) ($row['hari'] ?? '')))),
                'nomor_periode' => trim((string) ($row['nomor_periode'] ?? '')),
                'jam_mulai' => $start,
                'jam_selesai' => $end,
                'label' => trim((string) ($row['label'] ?? '')) ?: null,
            ];
            if ($start === '' || $end === '') {
                throw ValidationException::withMessages(['file' => "Baris {$line}: jam_mulai dan jam_selesai wajib diisi dengan format HH:MM."]);
            }
        }

        $request->merge(['periods' => $periods]);
        $response = $this->savePeriods($request, $calendar);
        $payload = $response->getData(true);
        $payload['message'] = count($periods).' baris detail kalender berhasil diimpor.';
        return response()->json($payload);
    }

    private function excelTimeValue(string $value): string
    {
        $value = trim($value);
        if (is_numeric($value) && (float) $value >= 0 && (float) $value < 1) {
            $minutes = (int) round((float) $value * 1440);
            return sprintf('%02d:%02d', intdiv($minutes, 60) % 24, $minutes % 60);
        }
        if (preg_match('/^(\\d{1,2}):(\\d{2})(?::\\d{2})?$/', $value, $match)) {
            return sprintf('%02d:%02d', (int) $match[1], (int) $match[2]);
        }
        return $value;
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
            'periods.*.jam_selesai' => ['required', 'date_format:H:i'],
            'periods.*.label' => ['nullable', 'string', 'max:50'],
        ]);

        foreach ($validated['periods'] as $period) {
            if ($period['jam_mulai'] >= $period['jam_selesai']) {
                throw ValidationException::withMessages(['periods' => 'Jam mulai setiap periode harus lebih awal daripada jam selesai.']);
            }
        }

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
