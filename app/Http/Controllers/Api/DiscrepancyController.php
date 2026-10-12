<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DiscrepancyCase;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DiscrepancyController extends Controller
{
    /**
     * Endpoint GET /api/v1/discrepancy-cases.
     * Menampilkan daftar kasus discrepancy dengan filter status dan rentang tanggal untuk proses review admin.
     */
    public function index(Request $request)
    {
        $data = $request->validate([
            'status' => ['sometimes', 'in:OPEN,IN_REVIEW,RESOLVED,DISMISSED'],
            'type' => ['sometimes', 'string', 'max:64'],
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date', 'after_or_equal:from'],
        ]);
        $query = DiscrepancyCase::query()->with('resolver:id,nama')->latest('tanggal');
        if (isset($data['status'])) $query->where('status', $data['status']);
        if (isset($data['type'])) $query->where('type', $data['type']);
        if (isset($data['from'])) $query->whereDate('tanggal', '>=', $data['from']);
        if (isset($data['to'])) $query->whereDate('tanggal', '<=', $data['to']);

        return response()->json([
            'data' => $query->paginate(30),
            'meta' => ['detector_state' => 'rules_pending', 'note' => 'Kasus baru belum dibuat sampai definisi actionable discrepancy disetujui.'],
        ]);
    }

    /**
     * Endpoint PATCH /api/v1/discrepancy-cases/{discrepancyCase}.
     * Mengubah status kasus discrepancy sekaligus menambah catatan resolusi saat masalah ditutup oleh admin.
     */
    public function update(Request $request, DiscrepancyCase $discrepancyCase)
    {
        $data = $request->validate([
            'status' => ['required', 'in:IN_REVIEW,RESOLVED,DISMISSED,OPEN'],
            'resolution_note' => ['nullable', 'string', 'max:5000'],
        ]);
        if (in_array($data['status'], ['RESOLVED', 'DISMISSED'], true) && blank($data['resolution_note'] ?? null)) {
            throw ValidationException::withMessages(['resolution_note' => 'Catatan wajib diisi untuk menutup kasus.']);
        }
        $closing = in_array($data['status'], ['RESOLVED', 'DISMISSED'], true);
        $discrepancyCase->forceFill([
            'status' => $data['status'],
            'resolution_note' => $data['resolution_note'] ?? null,
            'resolved_at' => $closing ? now() : null,
            'resolved_by' => $closing ? $request->user()->id : null,
        ])->save();

        return response()->json(['message' => 'Status kasus diperbarui.', 'data' => $discrepancyCase->refresh()]);
    }
}
