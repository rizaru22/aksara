<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('app:send-test-push-notification')]
#[Description('Command description')]
class SendTestPushNotification extends Command
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

            $this->info('Notifikasi tes diproses untuk: ' . $user->email);

            return self::SUCCESS;
        } catch (\Throwable $e) {
            report($e);
            $this->error('Pengiriman gagal: ' . $e->getMessage());

            return self::FAILURE;
        }
    }
}
