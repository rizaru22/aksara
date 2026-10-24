<?php

namespace App\\Http\\Controllers\\Api;

use App\\Http\\Controllers\\Controller;
use Illuminate\\Http\\Request;
use Illuminate\\Notifications\\DatabaseNotification;

class NotificationInboxController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $unread = $user->unreadNotifications()
            ->latest()
            ->get();

        $recentRead = $user->readNotifications()
            ->latest()
            ->limit(10)
            ->get();

        $notifications = $unread
            ->concat($recentRead)
            ->sortByDesc('created_at')
            ->values()
            ->map(fn (DatabaseNotification $notification) => [
                'id' => $notification->id,
                'type' => class_basename($notification->type),
                'data' => $notification->data,
                'read_at' => $notification->read_at?->toISOString(),
                'created_at' => $notification->created_at?->toISOString(),
            ]);

        return response()->json([
            'data' => $notifications,
            'unread_count' => $user->unreadNotifications()->count(),
            'read_display_count' => $recentRead->count(),
        ]);
    }

    public function markRead(Request $request, string $notification)
    {
        $record = $request->user()->notifications()->whereKey($notification)->firstOrFail();
        $record->markAsRead();

        return response()->json([
            'message' => 'Notifikasi ditandai sudah dibaca.',
            'unread_count' => $request->user()->unreadNotifications()->count(),
        ]);
    }

    public function markAllRead(Request $request)
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json([
            'message' => 'Semua notifikasi ditandai sudah dibaca.',
            'unread_count' => 0,
        ]);
    }
}
