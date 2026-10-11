<?php

namespace App\Console\Commands;

use App\Services\TeacherPushReminderService;
use Illuminate\Console\Command;

class SendTeacherPushReminders extends Command
{
    protected $signature = 'aksara:send-push-reminders';

    protected $description = 'Send scheduled attendance and teaching reminders by web push.';

    public function handle(TeacherPushReminderService $reminders): int
    {
        $result = $reminders->sendDueReminders();
        $this->info('Push reminders sent: '.($result['sent'] ?? 0));

        if (isset($result['skipped'])) {
            $this->comment('Skipped: '.$result['skipped']);
        }

        return self::SUCCESS;
    }
}
