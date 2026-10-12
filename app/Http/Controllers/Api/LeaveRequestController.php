<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PengajuanIzin;
use App\Models\User;
use App\Notifications\LeaveRequestSubmittedNotification;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class LeaveRequestController extends Controller
{
    private const SUBMITTER_ROLES = ['guru', 'tendik', 'admin', 'kurikulum'];

    /**
     * Endpoint GET /api/v1/leave-requests.
     * Menampilkan daftar pengajuan izin/cuti untuk admin atau user yang sedang login, termasuk filter pencarian.
     */
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
            abort_unless($this->canSubmitLeave($user), 403);
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

    /**
     * Endpoint GET /api/v1/leave-requests/mine.
     * Mengambil riwayat pengajuan izin milik user aktif untuk ditampilkan di halaman pribadi.
     */
    public function mine(Request $request)
    {
        abort_unless($this->canSubmitLeave($request->user()), 403);

        $items = PengajuanIzin::query()
            ->with('approver:id,nama')
            ->where('user_id', $request->user()->id)
            ->latest()
            ->paginate(20);

        return response()->json($items);
    }

    /**
     * Endpoint POST /api/v1/leave-requests.
     * Membuat pengajuan izin/cuti baru dengan validasi tanggal, alasan, dan lampiran bila ada.
     */
    public function store(Request $request)
    {
        abort_unless($this->canSubmitLeave($request->user()), 403);
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

        try {
            $this->notifyApprovers($requestRecord->load('user:id,nama'), $request->user());
        } catch (Throwable $exception) {
            Log::warning('Could not prepare web push notifications for leave request.', [
                'pengajuan_izin_id' => $requestRecord->id,
                'exception' => $exception->getMessage(),
            ]);
        }

        return response()->json(['message' => 'Pengajuan berhasil dikirim.', 'data' => $requestRecord], 201);
    }

    /**
     * Mengirim notifikasi push ke pihak yang berwenang agar pengajuan izin baru segera ditinjau.
     */
    private function notifyApprovers(PengajuanIzin $leaveRequest, User $submitter): void
    {
        if (! $this->canSubmitLeave($submitter)
            || ! config('webpush.vapid.public_key')
            || ! config('webpush.vapid.private_key')) {
            return;
        }

        $recipients = User::query()
            ->role(['admin', 'kepsek', 'kurikulum'])
            ->whereKeyNot($submitter->id)
            ->whereHas('pushSubscriptions')
            ->with('pushSubscriptions')
            ->get();

        $type = $leaveRequest->jenis_pengajuan === 'DINAS' ? 'Dinas luar' : 'Izin/cuti';
        $startDate = Carbon::parse($leaveRequest->tanggal_mulai)->format('d/m/Y');
        $endDate = Carbon::parse($leaveRequest->tanggal_selesai)->format('d/m/Y');
        $dates = $startDate === $endDate ? $startDate : $startDate.' - '.$endDate;

        foreach ($recipients as $recipient) {
            try {
                $recipient->notify(new LeaveRequestSubmittedNotification(
                    'Pengajuan perizinan baru',
                    sprintf('%s mengajukan %s untuk %s.', $leaveRequest->user?->nama ?? 'Guru', $type, $dates),
                    "leave-request-{$leaveRequest->id}",
                ));
            } catch (Throwable $exception) {
                Log::warning('Web push leave request notification failed.', [
                    'pengajuan_izin_id' => $leaveRequest->id,
                    'recipient_id' => $recipient->id,
                    'exception' => $exception->getMessage(),
                ]);
            }
        }
    }

    /**
     * Mengecek apakah user memiliki hak mengajukan izin atau cuti berdasarkan role dan permission.
     */
    private function canSubmitLeave(User $user): bool
    {
        return $user->can('ajukan-pengajuan-izin') || $user->hasAnyRole(self::SUBMITTER_ROLES);
    }

    /**
     * Endpoint PATCH /api/v1/leave-requests/{pengajuanIzin}/decide.
     * Menetapkan keputusan persetujuan atau penolakan terhadap pengajuan cuti atau dinas.
     */
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

    /**
     * Endpoint GET /api/v1/leave-requests/{pengajuanIzin}/attachment.
     * Mengunduh file lampiran pengajuan yang telah diupload oleh pemohon.
     */
    public function attachment(Request $request, PengajuanIzin $pengajuanIzin)
    {
        $user = $request->user();
        abort_unless($user->id === $pengajuanIzin->user_id || $user->can('kelola-pengajuan-izin'), 403);
        abort_unless($pengajuanIzin->berkas_lampiran && Storage::disk('local')->exists($pengajuanIzin->berkas_lampiran), 404);

        return Storage::disk('local')->download($pengajuanIzin->berkas_lampiran);
    }
}
