<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HariLibur;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class HolidayCalendarController extends Controller
{
    public function index(Request $request)
    {
        $filters = $request->validate([
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date', 'after_or_equal:from'],
        ]);
        $query = HariLibur::query()->orderBy('tanggal');
        if (isset($filters['from'])) $query->whereDate('tanggal', '>=', $filters['from']);
        if (isset($filters['to'])) $query->whereDate('tanggal', '<=', $filters['to']);

        return response()->json(['data' => $query->get()]);
    }

    public function adminIndex()
    {
        return response()->json(['data' => HariLibur::query()->orderByDesc('tanggal')->limit(500)->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'tanggal' => ['required', 'date', Rule::unique('hari_liburs', 'tanggal')],
            'nama' => ['required', 'string', 'max:255'],
            'jenis' => ['required', Rule::in(['NASIONAL', 'CUTI_BERSAMA', 'SEKOLAH'])],
            'catatan' => ['nullable', 'string', 'max:2000'],
        ]);
        $data['created_by'] = $request->user()->id;

        return response()->json(['message' => 'Hari libur berhasil ditambahkan.', 'data' => HariLibur::query()->create($data)], 201);
    }

    public function update(Request $request, HariLibur $hariLibur)
    {
        $data = $request->validate([
            'tanggal' => ['required', 'date', Rule::unique('hari_liburs', 'tanggal')->ignore($hariLibur->id)],
            'nama' => ['required', 'string', 'max:255'],
            'jenis' => ['required', Rule::in(['NASIONAL', 'CUTI_BERSAMA', 'SEKOLAH'])],
            'catatan' => ['nullable', 'string', 'max:2000'],
        ]);
        $hariLibur->update($data);

        return response()->json(['message' => 'Hari libur berhasil diperbarui.', 'data' => $hariLibur->refresh()]);
    }

    public function destroy(HariLibur $hariLibur)
    {
        $hariLibur->delete();

        return response()->json(['message' => 'Hari libur berhasil dihapus.']);
    }
}
