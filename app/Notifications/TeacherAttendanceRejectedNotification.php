<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

class TeacherAttendanceRejectedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $session,
        private readonly string $date,
        private readonly string $tag,
    ) {
    }

    public function via(object $notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush(object $notifiable, object $notification): WebPushMessage
    {
        return (new WebPushMessage)
            ->title("Presensi {$this->session} ditolak")
            ->body("Presensi {$this->session} tanggal {$this->date} ditolak. Buka AKSARA untuk melihat status dan tindak lanjut.")
            ->icon('/favicon.ico')
            ->badge('/favicon.ico')
            ->tag($this->tag)
            ->data(['url' => '/dashboard.html'])
            ->options(['TTL' => 3600]);
    }
}
