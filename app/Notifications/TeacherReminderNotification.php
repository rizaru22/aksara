<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

class TeacherReminderNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $title,
        private readonly string $body,
        private readonly string $tag,
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    public function toArray(object $notifiable): array\n    {\n        return [\n            'title' => $this->title,\n            'body' => $this->body,\n            'tag' => $this->tag,\n            'url' => '/dashboard.html',\n        ];\n    }\n\n    public function toWebPush(object $notifiable, object $notification): WebPushMessage
    {
        return (new WebPushMessage)
            ->title($this->title)
            ->body($this->body)
            ->icon('/favicon.ico')
            ->badge('/favicon.ico')
            ->tag($this->tag)
            ->data(['url' => '/dashboard.html'])
            ->options(['TTL' => 3600]);
    }
}
