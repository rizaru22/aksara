<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PengajuanIzin;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class LeaveRequestController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['sometimes', 'integer', 'in:10,20,50'],
        ]);
        $query = PengajuanIzin::query()
            ->with(['user:id,nama,nip', 'approver:id,nama'])
            ->latest('created_at')
            ->orderByDesc('id');
        if (! $user->can('kelola-pengajuan-izin')) {
            abort_unless($user->can('ajukan-pengajuan-izin'), 403);
            $query->where('user_id', $user->id);
        }

        if (filled($filters['search'] ?? null)) {
            $search = trim($filters['search']);
            $query->where(function ($builder) use ($search): void {
                $builder->where('jenis_pengajuan', 'like', "%{$search}%")
                    ->orWhere('status_approval', 'like', "%{$search}%")
                    ->orWhere('alasan', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($userQuery) => $userQuery
                        ->where('nama', 'like', "%{$search}%")
                        ->orWhere('nip', 'like', "%{$search}%"));
            });
        }

        return response()->json($query->paginate((int) ($filters['per_page'] ?? 20)));
    }

    public function mine(Request $request)
    {
        abort_unless($request->user()->can('ajukan-pengajuan-izin'), 403);

        $items = PengajuanIzin::query()
            ->with('approver:id,nama')
            ->where('user_id', $request->user()->id)
            ->latest()
            ->paginate(20);

        return response()->json($items);
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->can('ajukan-pengajuan-izin'), 403);
        $data = $request->validate([
            'jenis_pengajuan' => ['required', 'in:CUTI,DINAS'],
            'tanggal_mulai' => ['required', 'date'],
            'tanggal_selesai' => ['required', 'date', 'after_or_equal:tanggal_mulai'],
            'alasan' => ['required', 'string', 'min:10', 'max:5000'],
            'berkas_lampiran' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:5120'],
        ]);
        $path = null;
        try {
            $requestRecord = DB::transaction(function () use ($request, $data, &$path): PengajuanIzin {
                $user = $request->user();
                $user->newQuery()->whereKey($user->id)->lockForUpdate()->first();

                if ($data['jenis_pengajuan'] === 'CUTI') {
                    $duplicate = PengajuanIzin::query()
                        ->where('user_id', $user->id)
                        ->where('jenis_pengajuan', 'CUTI')
                        ->whereIn('status_approval', ['PENDING', 'APPROVED'])
                        ->whereDate('tanggal_mulai', '<=', $data['tanggal_selesai'])
                        ->whereDate('tanggal_selesai', '>=', $data['tanggal_mulai'])
                        ->exists();

                    if ($duplicate) {
                        throw ValidationException::withMessages([
                            'tanggal_mulai' => 'Anda sudah memiliki pengajuan izin/cuti/sakit yang masih aktif pada tanggal tersebut.',
                        ]);
                    }
                }

                $path = $request->file('berkas_lampiran')?->store('leave-requests', 'local');

                return PengajuanIzin::query()->create([
                    'user_id' => $user->id,
                    'jenis_pengajuan' => $data['jenis_pengajuan'],
                    'tanggal_mulai' => $data['tanggal_mulai'],
                    'tanggal_selesai' => $data['tanggal_selesai'],
                    'alasan' => $data['alasan'],
                    'berkas_lampiran' => $path,
                ]);
            });
        } catch (\Throwable $exception) {
            if ($path) Storage::disk('local')->delete($path);
            throw $exception;
        }

        return response()->json(['message' => 'Pengajuan berhasil dikirim.', 'data' => $requestRecord], 201);
    }

    public function decide(Request $request, PengajuanIzin $pengajuanIzin)
    {
        abort_unless($request->user()->can('kelola-pengajuan-izin'), 403);
        $data = $request->validate(['status_approval' => ['required', 'in:APPROVED,REJECTED']]);
        if ($pengajuanIzin->status_approval !== 'PENDING') {
            throw ValidationException::withMessages(['status_approval' => 'Pengajuan ini sudah diputuskan.']);
        }

        $pengajuanIzin->forceFill([
            'status_approval' => $data['status_approval'],
            'approved_by' => $request->user()->id,
        ])->save();

        return response()->json(['message' => 'Keputusan pengajuan tersimpan.', 'data' => $pengajuanIzin->refresh()]);
    }

    public function attachment(Request $request, PengajuanIzin $pengajuanIzin)
    {
        $user = $request->user();
        abort_unless($user->id === $pengajuanIzin->user_id || $user->can('kelola-pengajuan-izin'), 403);
        abort_unless($pengajuanIzin->berkas_lampiran && Storage::disk('local')->exists($pengajuanIzin->berkas_lampiran), 404);

        return Storage::disk('local')->download($pengajuanIzin->berkas_lampiran);
    }
}
