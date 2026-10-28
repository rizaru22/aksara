<?php
namespace App\Console\Commands;

use App\Models\User;
use App\Notifications\TeacherReminderNotification;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class SendTestPushNotification extends Commandyes
{
    protected $signature = 'aksara:test-push {email}';

    protected $description = 'Send a test push notification to one subscribed user';

    public function handle(): int
    {
        if (
            !config('webpush.vapid.public_key') ||
            !config('webpush.vapid.private_key')
        ) {
            $this->error('VAPID keys belum dikonfigurasi.');
            return self::FAILURE;
        }

        $user = User::query()
            ->where('email', $this->argument('email'))
            ->whereHas('pushSubscriptions')
            ->first();

        if (!$user) {
            $this->error(
                'User tidak ditemukan atau belum memiliki langganan push.'
            );
            return self::FAILURE;
        }

        try {
            $user->notify(new TeacherReminderNotification(
                'Tes Push AKSARA',
                'Ini adalah notifikasi tes dari server AKSARA.',
                'test-push-' . Str::uuid(),
            ));

            $this->info(
                'Notifikasi tes diproses untuk: ' . $user->email
            );

            return self::SUCCESS;
        } catch (\Throwable $e) {
            report($e);
            $this->error('Pengiriman gagal: ' . $e->getMessage());

            return self::FAILURE;
        }
    }
}
