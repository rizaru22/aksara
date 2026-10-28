<?php

namespace App\Services;

use App\Models\PengajuanIzin;
use App\Models\User;
use App\Notifications\LeaveRequestSubmittedNotification;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

class PendingLeaveRequestReminderService
{
    /**
     * Mengirim ulang pengingat untuk pengajuan yang masih menunggu keputusan.
     * Status selalu dibaca dari database saat job berjalan, sehingga pengajuan
     * yang sudah disetujui atau ditolak tidak akan dikirimi pengingat lagi.
     */
    public function sendPendingReminders(): array
    {
        if (! config('webpush.vapid.public_key') || ! config('webpush.vapid.private_key')) {
            return ['sent' => 0, 'skipped' => 'VAPID keys are not configured.'];
        }

        $recipients = User::query()
            ->role(['admin', 'kurikulum', 'kepsek'])
            ->whereHas('pushSubscriptions')
            ->with('pushSubscriptions')
            ->get();

        if ($recipients->isEmpty()) {
            return ['sent' => 0, 'skipped' => 'No subscribed approvers.'];
        }

        $pendingRequests = PengajuanIzin::query()
            ->with('user:id,nama')
            ->where('status_approval', 'PENDING')
            ->orderBy('created_at')
            ->get();

        $sent = 0;

        foreach ($pendingRequests as $leaveRequest) {
            $type = $leaveRequest->jenis_pengajuan === 'DINAS' ? 'Dinas luar' : 'Izin/cuti';
            $startDate = Carbon::parse($leaveRequest->tanggal_mulai)->format('d/m/Y');
            $endDate = Carbon::parse($leaveRequest->tanggal_selesai)->format('d/m/Y');
            $dates = $startDate === $endDate ? $startDate : $startDate.' - '.$endDate;
            $body = sprintf(
                '%s mengajukan %s untuk %s. Pengajuan ini masih menunggu persetujuan.',
                $leaveRequest->user?->nama ?? 'Guru',
                $type,
                $dates,
            );

            foreach ($recipients as $recipient) {
                if ((int) $recipient->id === (int) $leaveRequest->user_id) {
                    continue;
                }

                try {
                    $recipient->notify(new LeaveRequestSubmittedNotification(
                        'Pengajuan perizinan masih menunggu',
                        $body,
                        // Reuse the tag so the browser updates the existing notification
                        // instead of stacking a new visible notification every 15 minutes.
                        "leave-request-{$leaveRequest->id}",
                    ));
                    $sent++;
                } catch (Throwable $exception) {
                    Log::warning('Pending leave request reminder failed.', [
                        'pengajuan_izin_id' => $leaveRequest->id,
                        'recipient_id' => $recipient->id,
                        'exception' => $exception->getMessage(),
                    ]);
                }
            }
        }

        return ['sent' => $sent, 'pending' => $pendingRequests->count()];
    }
}
