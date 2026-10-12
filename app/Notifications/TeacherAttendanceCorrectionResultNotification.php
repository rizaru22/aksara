<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

class TeacherAttendanceCorrectionResultNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $session,
        private readonly string $date,
        private readonly string $decision,
        private readonly string $tag,
    ) {
    }

    public function via(object $notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush(object $notifiable, object $notification): WebPushMessage
    {
        $accepted = $this->decision === 'APPROVED';

        return (new WebPushMessage)
            ->title($accepted ? 'Koreksi presensi diterima' : 'Koreksi presensi ditolak')
            ->body("Koreksi absen {$this->session} tanggal {$this->date} telah ".($accepted ? 'diterima' : 'ditolak').'. Buka AKSARA untuk melihat status dan catatan admin.')
            ->icon('/favicon.ico')
            ->badge('/favicon.ico')
            ->tag($this->tag)
            ->data(['url' => '/dashboard.html'])
            ->options(['TTL' => 3600]);
    }
}
